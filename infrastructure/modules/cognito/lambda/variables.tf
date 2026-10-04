variable "user_pool_arn" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}
variable "auth_lambda_env_name" {
  type = string
}

variable "auth_lambda_env_arn" {
  type = string
}