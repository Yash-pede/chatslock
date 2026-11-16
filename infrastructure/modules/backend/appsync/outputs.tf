output "appSyncArn" {
  value = aws_appsync_api.api.api_arn
}

output "appSyncId" {
  value = aws_appsync_api.api.api_id
}

/** HTTP base URL used by backend publishers (POST <endpoint>/event). */
output "appSyncHttpEndpoint" {
  value = "https://${aws_appsync_api.api.dns["HTTP"]}"
}
