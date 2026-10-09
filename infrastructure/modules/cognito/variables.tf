variable "resource_name" {
  type = string
}
variable "vpc_id" {
  type = string
}
variable "private_subnet_ids" {
  type = list(string)
}

variable "auth_lambda_secret_name" {
  type = string
}

variable "auth_lambda_secret_arn" {
  type = string
}
