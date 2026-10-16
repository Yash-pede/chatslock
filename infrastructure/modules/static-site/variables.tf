variable "domain_name" {
  description = "Apex domain the site is served on. Must already exist as a Route53 hosted zone."
  type        = string
}

variable "resource_name" {
  description = "Name prefix for created resources."
  type        = string
}
