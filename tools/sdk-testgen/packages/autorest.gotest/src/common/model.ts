import { ExampleModel, MockTestDefinitionModel, TestDefinitionModel } from '@autorest/testmodeler/dist/src/core/model';

interface GoFileData {
    packageName: string;
    packagePath?: string;
    imports: string;
}

export class GoMockTestDefinitionModel extends MockTestDefinitionModel implements GoFileData {
    packageName: string;
    imports: string;
}

export type GoTestDefinition = TestDefinitionModel & GoFileData;

export class GoExampleModel extends ExampleModel {
    opName: string;
    isLRO: boolean;
    isPageable: boolean;
    methodParametersOutput: MultiOutput;
    clientParametersOutput: MultiOutput;
    returnInfo: string[];
    nonNilReturns: string[];
    checkResponse: boolean;
    pollerType: string;
    pageableType: string;
}

export class MultiOutput {
    public constructor(public stringParamWithExampleValue:string, public stringParamWithParamName:string){}
}