## Go

These settings apply only when `--go` is specified on the command line.

``` yaml $(go)
tag: package-2020-07-01-preview
go:
  license-header: MICROSOFT_MIT_NO_VERSION
  namespace: signalr
  clear-output-folder: true
```

### Go multi-api

``` yaml $(go) && $(multiapi)
batch:
  - tag: package-2018-03-01-preview
  - tag: package-2018-10-01
  - tag: package-2020-05-01
  - tag: package-2020-07-01-preview
  - tag: package-2021-04-01-preview
```

### Tag: package-2018-03-01-preview and go

These settings apply only when `--tag=package-2018-03-01-preview --go` is specified on the command line.
Please also specify `--go-sdk-folder=<path to the root directory of your azure-sdk-for-go clone>`.

``` yaml $(tag) == 'package-2018-03-01-preview' && $(go)
output-folder: $(go-sdk-folder)/services/preview/$(namespace)/mgmt/2018-03-01-preview/$(namespace)
```

### Tag: package-2018-10-01 and go

These settings apply only when `--tag=package-2018-10-01 --go` is specified on the command line.
Please also specify `--go-sdk-folder=<path to the root directory of your azure-sdk-for-go clone>`.

``` yaml $(tag) == 'package-2018-10-01' && $(go)
output-folder: $(go-sdk-folder)/services/$(namespace)/mgmt/2018-10-01/$(namespace)
```

### Tag: package-2020-05-01 and go

These settings apply only when `--tag=package-2020-05-01 --go` is specified on the command line.
Please also specify `--go-sdk-folder=<path to the root directory of your azure-sdk-for-go clone>`.

``` yaml $(tag) == 'package-2020-05-01' && $(go)
output-folder: $(go-sdk-folder)/services/$(namespace)/mgmt/2020-05-01/$(namespace)
```

### Tag: package-2020-07-01-preview and go

These settings apply only when `--tag=package-2020-07-01-preview --go` is specified on the command line.
Please also specify `--go-sdk-folder=<path to the root directory of your azure-sdk-for-go clone>`.

``` yaml $(tag) == 'package-2020-07-01-preview' && $(go)
output-folder: $(go-sdk-folder)/services/preview/$(namespace)/mgmt/2020-07-01-preview/$(namespace)
```

### Tag: package-2021-04-01-preview and go

These settings apply only when `--tag=package-2021-04-01-preview --go` is specified on the command line.
Please also specify `--go-sdk-folder=<path to the root directory of your azure-sdk-for-go clone>`.

``` yaml $(tag) == 'package-2021-04-01-preview' && $(go)
output-folder: $(go-sdk-folder)/services/preview/$(namespace)/mgmt/2021-04-01-preview/$(namespace)
```
