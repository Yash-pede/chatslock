variable "domain_name" {
  type = string
}
variable "cognito_user_client" {
  type = string
}

variable "cognito_admin_client" {
  type = string
}

variable "ws_authorizer_lambda_invoke_arn" {
  type = string
}

variable "ws_events_lambda_invoke_arn" {
  type = string
}

variable "cognito_issuer" {
  type = string
}

variable "lambda_details" {
  type = map(object({
    arn  = string
    name = string
  }))
}
