data "aws_availability_zones" "available" {}

locals {
  name = var.resource_name

  vpc_cidr = "10.0.0.0/16"
  azs      = slice(data.aws_availability_zones.available.names, 0, 3)

  tags = {
    Name = local.name
  }
}

module "vpc" {
  source = "terraform-aws-modules/vpc/aws"

  name = local.name
  cidr = local.vpc_cidr
  azs  = local.azs

  public_subnets  = [for k, v in local.azs : cidrsubnet(local.vpc_cidr, 8, k)]     # /24
  private_subnets = [for k, v in local.azs : cidrsubnet(local.vpc_cidr, 8, k + 3)] # /24

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = local.tags
}

module "cognito"{
  source = "./modules/cognito"

  resource_name = local.name
  vpc_id = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnets
}

