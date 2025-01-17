import * as Constants from 'oav/dist/lib/util/constants'
import * as lodash from 'lodash'
import * as oav from 'oav'
import * as path from 'path'
import { Config } from '../common/config'
import {
    HasChildResource,
    HttpStatusCode,
    IntentionalError,
    LroCallbackNotFound,
    NoParentResource,
    NoResponse,
    ResourceNotFound,
    ValidationFail
} from '../common/errors'
import { InjectableTypes } from '../lib/injectableTypes'
import { LRO_CALLBACK } from '../common/constants'
import { OperationMatch, OperationSearcher } from 'oav/dist/lib/liveValidation/operationSearcher'
import { ResourcePool } from './resource'
import { ResponseGenerator } from './responser'
import { SpecRetriever } from '../lib/specRetriever'
import { ValidationRequest } from 'oav/dist/lib/liveValidation/operationValidator'
import { VirtualServerRequest, VirtualServerResponse } from './models'
import {
    getPath,
    getPureUrl,
    isManagementUrlLevel,
    logger,
    queryToObject,
    replacePropertyValue
} from '../common/utils'
import { get_locations, get_tenants } from './specials'
import { inject, injectable } from 'inversify'

export enum ValidatorStatus {
    NotInitialized = 'Validator not initialized',
    Initialized = 'Validator initialized',
    InitializationFailed = 'Validator initialization failure'
}

@injectable()
export class Coordinator {
    private liveValidator: oav.LiveValidator
    private statusValue = ValidatorStatus.NotInitialized
    private resourcePool: ResourcePool

    constructor(
        @inject(InjectableTypes.Config) private config: Config,
        @inject(InjectableTypes.SpecRetriever) private specRetriever: SpecRetriever,
        @inject(InjectableTypes.ResponseGenerator)
        private responseGenerator: ResponseGenerator
    ) {
        this.initiateResourcePool()
    }

    public initiateResourcePool() {
        this.resourcePool = new ResourcePool(this.config.cascadeEnabled)
    }

    private findResponse(responses: Record<string, any>, status: number): [number, any] {
        let nearest = undefined
        for (const code in responses) {
            if (
                nearest === undefined ||
                Math.abs(nearest - status) > Math.abs(parseInt(code) - status)
            ) {
                nearest = parseInt(code)
            }
        }
        if (nearest) return [nearest, responses[nearest.toString()].body]
        throw new NoResponse(status.toString())
    }

    private search(
        searcher: OperationSearcher,
        info: ValidationRequest
    ): {
        operationMatch: OperationMatch
        apiVersion: string
    } {
        const requestInfo = { ...info }
        const searchOperation = () => {
            const operations = searcher.getPotentialOperations(requestInfo)
            return operations
        }
        let potentialOperations = searchOperation()
        const firstReason = potentialOperations.reason

        if (potentialOperations?.matches.length === 0) {
            requestInfo.apiVersion = Constants.unknownApiVersion
            potentialOperations = searchOperation()
        }

        if (potentialOperations.matches.length === 0) {
            throw firstReason ?? potentialOperations.reason
        }

        return {
            operationMatch: potentialOperations.matches.slice(-1)[0],
            apiVersion: potentialOperations.apiVersion
        }
    }

    public get Validator(): oav.LiveValidator {
        return this.liveValidator
    }

    public get ValidatorStatus(): ValidatorStatus {
        return this.statusValue
    }

    public async initialize(): Promise<void> {
        if (this.liveValidator) {
            return
        }

        try {
            await this.specRetriever.retrieveSpecs()
        } catch (err) {
            logger.error(`Validator: unable to refresh the Validator. Error:${err}`)
            return
        }

        const options = {
            git: {
                url: this.config.specRetrievalGitUrl,
                shouldClone: false
            },
            swaggerPathsPattern: this.config.validationPathsPattern,
            directory: path.resolve(this.config.specRetrievalLocalRelativePath),
            isPathCaseSensitive: false
        }
        this.liveValidator = new oav.LiveValidator(options)
        await this.liveValidator.initialize()
        this.statusValue = ValidatorStatus.Initialized
        logger.info('validator initialized')
    }

    public async generateResponse(
        req: VirtualServerRequest,
        res: VirtualServerResponse,
        profile: Record<string, any>
    ): Promise<void> {
        const fullUrl = req.protocol + '://' + req.headers?.host + req.url
        const liveRequest = {
            url: fullUrl,
            method: req.method,
            headers: req.headers as any,
            query: req.query as any,
            body: req.body
        }

        const validationRequest = this.liveValidator.parseValidationRequest(
            liveRequest.url,
            liveRequest.method,
            ''
        )
        const validateResult = await this.validate(liveRequest)

        if (
            validateResult.isSuccessful ||
            validateResult.runtimeException?.code ===
                Constants.ErrorCodes.MultipleOperationsFound.name
        ) {
            const result = this.search(this.liveValidator.operationSearcher, validationRequest)
            const example = await this.responseGenerator.generate(
                result.operationMatch.operation,
                this.config,
                liveRequest
            )
            if (profile?.alwaysError) {
                throw new IntentionalError()
            }
            await this.genStatefulResponse(req, res, example.responses, profile)
        } else {
            const exampleResponse = this.handleSpecials(req, validationRequest)
            if (exampleResponse === undefined) {
                throw new ValidationFail(JSON.stringify(validateResult))
            } else {
                await this.genStatefulResponse(req, res, exampleResponse, profile)
            }
        }
    }

    public handleSpecials(
        req: VirtualServerRequest,
        validationRequest: ValidationRequest
    ): Record<string, any> | undefined {
        if (validationRequest.providerNamespace === 'microsoft.unknown') {
            const path = getPath(getPureUrl(req.url))
            if (path.length === 2) {
                // handle "/subscriptions/{subscriptionId}"
                return {
                    [HttpStatusCode.OK]: {
                        body: {
                            id: `/subscriptions/${path[1]}`,
                            authorizationSource: 'RoleBased',
                            managedByTenants: [],
                            subscriptionId: `${path[1]}`,
                            tenantId: '0000000-0000-0000-0000-000000000000',
                            displayName: 'Name of the subscription',
                            state: 'Enabled',
                            subscriptionPolicies: {
                                locationPlacementId: 'Internal_2014-09-01',
                                quotaId: 'Internal_2014-09-01',
                                spendingLimit: 'Off'
                            }
                        }
                    }
                }
            }
            if (path.length === 4 && path[2].toLowerCase() === 'resourcegroups') {
                // handle "/subscriptions/xxx/resourceGroups/xxx"
                return {
                    [HttpStatusCode.OK]: {
                        body: {
                            id: getPureUrl(req.url),
                            location: 'eastus',
                            managedBy: null,
                            name: path[3],
                            properties: {
                                provisioningState: 'Succeeded'
                            },
                            tags: {},
                            type: 'Microsoft.Resources/resourceGroups'
                        }
                    }
                }
            }
            if (path.length === 3 && path[2].toLowerCase() === 'locations') {
                return {
                    [HttpStatusCode.OK]: {
                        body: replacePropertyValue(
                            '0000000-0000-0000-0000-000000000000',
                            path[1],
                            get_locations
                        )
                    }
                }
            }
            if (path.length === 1 && path[0].toLowerCase() === 'tenants') {
                return { [HttpStatusCode.OK]: { body: get_tenants } }
            }
        }
        return undefined
    }

    public async genStatefulResponse(
        req: VirtualServerRequest,
        res: VirtualServerResponse,
        exampleResponses: Record<string, any>,
        profile: Record<string, any>
    ) {
        if (profile?.stateful) {
            const url: string = getPureUrl(req.url) as string
            const pathNames = getPath(url)
            // in stateful behaviour, GET and DELETE can only be called if resource/path exist
            if (
                ['GET', 'DELETE', 'PATCH'].indexOf(req.method.toUpperCase()) >= 0 &&
                isManagementUrlLevel(pathNames.length, url) &&
                !this.resourcePool.hasUrl(req)
            ) {
                throw new ResourceNotFound(url)
            }
        }

        const manipulateSucceed = this.resourcePool.updateResourcePool(req)
        if (profile?.stateful && !manipulateSucceed) {
            if (ResourcePool.isCreateMethod(req)) {
                throw new NoParentResource(req.url)
            } else {
                throw new HasChildResource(req.url)
            }
        } else {
            const [code, _ret] = this.findResponse(exampleResponses, HttpStatusCode.OK)

            let ret = _ret
            // simplified paging
            ret = lodash.omit(ret, 'nextLink')

            // simplified LRO
            ret = replacePropertyValue('provisioningState', 'Succeeded', ret)

            if (code !== HttpStatusCode.OK && code !== HttpStatusCode.NO_CONTENT && code < 300) {
                res.setHeader('Azure-AsyncOperation', await this.findLROGet(req))
                res.setHeader('Retry-After', 1)
            }
            if (req.query?.[LRO_CALLBACK] === 'true') {
                ret.status = 'Succeeded'
            }

            //set name
            const path = getPath(getPureUrl(req.url))
            ret = replacePropertyValue('name', path[path.length - 1], ret, (v) => {
                return typeof v === 'string'
            })

            res.set(code, ret)
        }
    }

    async findLROGet(req: VirtualServerRequest): Promise<string> {
        const [uri, query] = `${req.url}&${LRO_CALLBACK}=true`.split('?')
        const uriPath = uri.split('/')
        const objQuery = queryToObject(query)
        let firstloop = true
        while (uriPath.length > 0) {
            if (firstloop || uriPath.length % 2 === 1) {
                const testingUrl = `${req.protocol}://${req.headers?.host}${uriPath.join(
                    '/'
                )}?${query}`
                const liveRequest = {
                    url: testingUrl,
                    method: 'GET',
                    headers: req.headers as any,
                    query: objQuery,
                    body: {}
                }
                const validateResult = await this.validate(liveRequest)
                if (validateResult.isSuccessful) {
                    return testingUrl
                }
            }
            uriPath.splice(-1)
            firstloop = false
        }
        throw new LroCallbackNotFound(`Lro operation: ${req.method} ${req.url}`)
    }

    async validate(liveRequest: oav.LiveRequest) {
        return this.liveValidator.validateLiveRequest(liveRequest)
    }
}
