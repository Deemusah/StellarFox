# StellarFox

StellarFox is a decentralized application platform built on the Stellar network.

## Infrastructure as Code

All infrastructure for StellarFox is defined as code using [Terraform](https://www.terraform.io/).
This makes environments reproducible: the same configuration can be provisioned consistently
across development, staging, and production.

### Layout

```
infra/
  terraform/
    main.tf          # Provider configuration and shared locals
    variables.tf     # Input variables (documented, with defaults)
    outputs.tf       # Values exposed after provisioning
    network.tf       # Networking resources
    compute.tf       # Application compute resources
    database.tf      # Managed database resources
    storage.tf       # Object storage resources
    terraform.tfvars.example  # Example variable values
```

### Prerequisites

- Terraform >= 1.5.0
- Credentials for the target cloud provider, supplied via environment variables
  (never committed to the repository)

### Usage

```bash
cd infra/terraform

# Initialize providers and modules
terraform init

# Review the execution plan
terraform plan -var-file=terraform.tfvars

# Provision the infrastructure
terraform apply -var-file=terraform.tfvars

# Tear down when no longer needed
terraform destroy -var-file=terraform.tfvars
```

Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in environment-specific
values before running `plan` or `apply`. The `terraform.tfvars` file is git-ignored.

### Reproducibility

Because every resource is declared in code, environments can be recreated from scratch
by running `terraform apply` against a fresh state. Remote state is configured so that
multiple operators share a single source of truth.

### Testing

Infrastructure changes are validated in CI:

```bash
cd infra/terraform
terraform fmt -check
terraform init -backend=false
terraform validate
```

These checks run on every pull request that touches `infra/terraform/**` and fail the
build if the configuration is malformed or not reproducible.

## Development

See the individual package READMEs for application-level setup instructions.
