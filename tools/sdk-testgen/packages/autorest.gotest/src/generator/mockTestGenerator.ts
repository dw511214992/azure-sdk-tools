/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license output.pushrmation.
 *--------------------------------------------------------------------------------------------*/

import { Helper } from '@autorest/testmodeler/dist/src/util/helper';
import { ExampleParameter, ExampleValue } from '@autorest/testmodeler/dist/src/core/model';
import { BaseCodeGenerator, BaseDataRender } from './baseGenerator';
import { GoExampleModel, GoMockTestDefinitionModel, MultiOutput } from '../common/model';
import { isLROOperation, isPageableOperation } from '@autorest/go/dist/common/helpers';
import { generateReturnsInfo, getAPIParametersSig, getClientParametersSig, getSchemaResponse } from '../util/codegenBridge';
import { ArraySchema, ChoiceSchema, DateTimeSchema, DictionarySchema, GroupProperty, Metadata, ObjectSchema, Parameter, Schema, SchemaType } from '@autorest/codemodel';
import { GoHelper } from '../util/goHelper';
import { Config } from '../common/constant';
export class MockTestDataRender extends BaseDataRender {
    public generateRenderData(): void {
        const mockTest = this.context.codeModel.testModel.mockTest as GoMockTestDefinitionModel;
        for (const exampleGroup of mockTest.exampleGroups) {
            for (const example of exampleGroup.examples as GoExampleModel[]) {
                this.fillExampleOutput(example);
            }
        }
    }

    protected fillExampleOutput(example: GoExampleModel) {
        const op = example.operation;
        example.opName = op.language.go.name;
        if (isLROOperation(op as any)) {
            example.opName = 'Begin' + example.opName;
            example.isLRO = true;
            this.context.importManager.add('time');
            example.pollerType = example.operation.language.go.responseEnv.language.go.name;
        } else {
            example.isLRO = false;
        }
        example.isPageable = isPageableOperation(op as any);
        example.methodParametersOutput = this.toParametersOutput(getAPIParametersSig(op), example.methodParameters);
        example.clientParametersOutput = this.toParametersOutput(getClientParametersSig(example.operationGroup), example.clientParameters);
        example.returnInfo = generateReturnsInfo(op, 'op');
        let responseSchema = getSchemaResponse(op as any)?.schema;
        if (!example.isLRO && example.isPageable) {
            const valueName = op.extensions['x-ms-pageable'].itemName === undefined ? 'value' : op.extensions['x-ms-pageable'].itemName;
            for (const property of responseSchema['properties']) {
                if (property.serializedName === valueName) {
                    responseSchema = property.schema.elementType;
                    break;
                }
            }
            example.pageableType = example.operation.language.go.pageableType.name;
        }
        const allReturnProperties = Helper.getAllProperties(responseSchema as any, true);
        example.nonNilReturns = [];
        for (const variable of ['ID']) {
            for (const p of allReturnProperties) {
                if (this.getLanguageName(p) === variable) {
                    example.nonNilReturns.push(`${this.getLanguageName(responseSchema)}.${variable}`);
                }
            }
        }
        example.checkResponse = example.nonNilReturns.length > 0;
    }

    // get GO code of all parameters for one operation invoke
    protected toParametersOutput(paramsSig: Array<[string, string, Parameter | GroupProperty]>, exampleParameters: ExampleParameter[]): MultiOutput {
        const parammsOutput: MultiOutput[] = paramsSig.map(([paramName, typeName, parameter]) => {
            if (parameter === undefined || parameter === null) {
                return new MultiOutput(paramName, paramName);
            }
            return this.genParameterOutput(paramName, typeName, parameter, exampleParameters) || new MultiOutput('nil', 'nil');
        });
        return new MultiOutput(parammsOutput.map((x) => x.stringParamWithExampleValue).join(',\n'), parammsOutput.map((x) => x.stringParamWithParamName).join(',\n'));
    }

    // get GO code of single parameter for one operation invoke
    protected genParameterOutput(paramName: string, paramType: string, parameter: Parameter | GroupProperty, exampleParameters: ExampleParameter[]): MultiOutput | undefined {
        // get cooresponding example value of a parameter
        const findExampleParameter = (name: string, isPtr: boolean): MultiOutput | undefined => {
            for (const methodParameter of exampleParameters) {
                if (this.getLanguageName(methodParameter.parameter) === name) {
                    return this.exampleValueToString(methodParameter.exampleValue, isPtr);
                }
            }
            return undefined;
        };

        if ((parameter as GroupProperty).originalParameter) {
            const group = parameter as GroupProperty;
            const ptr = paramType.startsWith('*') ? '&' : '';
            let ret = `${ptr}${this.context.packageName + '.'}${this.getLanguageName(parameter.schema)}{`;
            let hasContent = false;
            for (const insideParameter of group.originalParameter) {
                // TODO: insideParameter is ptr or not
                const insideOutput = findExampleParameter(this.getLanguageName(insideParameter), false);
                if (insideOutput) {
                    ret += `${this.getLanguageName(insideParameter)}: ${insideOutput},\n`;
                    hasContent = true;
                }
            }
            ret += '}';
            // TODO: why mock test not return nil
            // if ([TargetMode.sample, TargetMode.scenarioTest].indexOf(targetMode) >= 0 && ptr.length > 0 && !hasContent) {
            //     ret = 'nil';
            // }
            if (ptr.length > 0 && !hasContent) {
                ret = 'nil';
            }
            return new MultiOutput(ret, ret);
        }
        return findExampleParameter(paramName, paramType.startsWith('*'));
    }

    protected exampleValueToString(exampleValue: ExampleValue, isPtr: boolean | undefined, inArray = false): MultiOutput {
        if (exampleValue === null || exampleValue === undefined || exampleValue.isNull) {
            return new MultiOutput('nil', 'nil');
        }
        const isPolymophismValue = exampleValue?.schema?.type === SchemaType.Object && (exampleValue.schema as ObjectSchema).discriminatorValue;
        const ptr = (exampleValue.language?.go?.byValue && !isPolymophismValue) || isPtr === false ? '' : '&';
        if (exampleValue.schema?.type === SchemaType.Array) {
            const elementPtr = exampleValue.schema.language.go.elementIsPtr ? '*' : '';
            const elementTypeName = this.getLanguageName((exampleValue.schema as ArraySchema).elementType);
            if (exampleValue.elements === undefined) {
                const result = `${ptr}[]${elementPtr}${GoHelper.isPrimitiveType(elementTypeName) ? '' : this.context.packageName + '.'}${elementTypeName}{}`;
                return new MultiOutput(result, result);
            } else {
                const result =
                    `${ptr}[]${elementPtr}${GoHelper.isPrimitiveType(elementTypeName) ? '' : this.context.packageName + '.'}${elementTypeName}{\n` +
                    exampleValue.elements.map((x) => this.exampleValueToString(x, exampleValue.schema.language.go.elementIsPtr)).join(',\n') +
                    '}';
                return new MultiOutput(result, result);
            }
        } else if (exampleValue.schema?.type === SchemaType.Object) {
            let output = '';
            if (inArray) {
                output += `{\n`;
            } else {
                output += `${ptr}${this.context.packageName + '.'}${this.getLanguageName(exampleValue.schema)}{\n`;
            }
            for (const [_, parentValue] of Object.entries(exampleValue.parentsValue || {})) {
                output += `${this.getLanguageName(parentValue)}: ${this.exampleValueToString(parentValue, false)},\n`;
            }
            for (const [_, value] of Object.entries(exampleValue.properties || {})) {
                output += `${this.getLanguageName(value)}: ${this.exampleValueToString(value, undefined)},\n`;
            }
            output += '}';
            return new MultiOutput(output, output);
        } else if (exampleValue.schema?.type === SchemaType.Dictionary) {
            let output = `${ptr}map[string]${exampleValue.schema.language.go.elementIsPtr ? '*' : ''}${(exampleValue.schema as DictionarySchema).elementType.language.go.name}{\n`;
            for (const [key, value] of Object.entries(exampleValue.properties || {})) {
                output += `"${key}": ${this.exampleValueToString(value, exampleValue.schema.language.go.elementIsPtr)},\n`;
            }
            output += '}';
            return new MultiOutput(output, output);
        }

        const valueWithExampleString = exampleValue.rawValue;
        let valueWithParaNameString = valueWithExampleString;
        if (this.getLanguageName(exampleValue.schema) === 'string' && exampleValue.language) {
            valueWithParaNameString = '<' + Helper.toKebabCase(this.getLanguageName(exampleValue)) + '>';
        }
        return new MultiOutput(
            this.rawValueToString(valueWithExampleString, exampleValue.schema, isPtr === undefined ? !exampleValue.language.go.byValue : isPtr),
            this.rawValueToString(valueWithParaNameString, exampleValue.schema, isPtr === undefined ? !exampleValue.language.go.byValue : isPtr),
        );
    }

    protected getStringValue(rawValue: string){
        return Helper.quotedEscapeString(rawValue);
    }

    protected rawValueToString(rawValue: any, schema: Schema, isPtr: boolean): string {
        let ret = JSON.stringify(rawValue);
        if (rawValue !== null && rawValue !== undefined && Object.getPrototypeOf(rawValue) === Object.prototype) {
            ret = '`' + ret + '`';
        }
        const goType = this.getLanguageName(schema);
        if ([SchemaType.Choice, SchemaType.SealedChoice].indexOf(schema.type) >= 0) {
            const choiceValue = Helper.findChoiceValue(schema as ChoiceSchema, rawValue);
            ret = this.context.packageName + '.' + this.getLanguageName(choiceValue);
        }
        if (schema.type === SchemaType.Constant || goType === 'string') {
            ret = this.getStringValue(rawValue);
        } else if (goType === 'time.Time') {
            this.context.importManager.add('time');
            const timeFormat = (schema as DateTimeSchema).format === 'date-time-rfc1123' ? 'time.RFC1123' : 'time.RFC3339Nano';
            ret = `func() time.Time { t, _ := time.Parse(${timeFormat}, "${rawValue}"); return t}()`;
        } else if (goType === 'map[string]interface{}') {
            ret = GoHelper.obejctToString(rawValue);
        } else if (goType === 'bool') {
            ret = rawValue.toString();
        }

        if (isPtr) {
            const ptrConverts = {
                string: 'StringPtr',
                bool: 'BoolPtr',
                'time.Time': 'TimePtr',
                int32: 'Int32Ptr',
                int64: 'Int64Ptr',
                float32: 'Float32Ptr',
                float64: 'Float64Ptr',
            };

            if (schema.type === SchemaType.Constant) {
                ret = `to.StringPtr(${ret})`;
                this.context.importManager.add('github.com/Azure/azure-sdk-for-go/sdk/azcore/to');
            } else if ([SchemaType.Choice, SchemaType.SealedChoice].indexOf(schema.type) >= 0) {
                ret += '.ToPtr()';
            } else if (Object.prototype.hasOwnProperty.call(ptrConverts, goType)) {
                ret = `to.${ptrConverts[goType]}(${ret})`;
                this.context.importManager.add('github.com/Azure/azure-sdk-for-go/sdk/azcore/to');
            } else {
                ret = '&' + ret;
            }
        }

        return ret;
    }

    protected getLanguageName(meta: any): string {
        return (meta as Metadata).language.go.name;
    }
}

export class MockTestCodeGenerator extends BaseCodeGenerator {
    public generateCode(extraParam: object = {}): void {
        this.renderAndWrite(this.context.codeModel.testModel.mockTest, 'mockTest.go.njk', `${this.getFilePrefix(Config.testFilePrefix)}mock_test.go`, extraParam);
    }
}
