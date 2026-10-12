variable "api_gateway_execution_arn" {
  type = string
}

variable "api_lambda_secret_arn" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_subnet_ids" {
  type = list(string)
}

variable "s3_media_bucket_name" {
  type = string
}
