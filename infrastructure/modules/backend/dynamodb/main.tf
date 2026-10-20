resource "aws_dynamodb_table" "environment" {
  name         = "chat"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "username"
    type = "S"
  }

  attribute {
    name = "member_user"
    type = "S"
  }

  global_secondary_index {
    name            = "SK_username_GSI"
    projection_type = "ALL"

    key_schema {
      attribute_name = "SK"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "username"
      key_type       = "RANGE"
    }
  }

  global_secondary_index {
    name            = "ConversationsMemberList_GSI"
    projection_type = "ALL"

    key_schema {
      attribute_name = "SK"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "member_user"
      key_type       = "RANGE"
    }
  }

  lifecycle {
    #    prevent_destroy = true
    ignore_changes = [read_capacity, write_capacity]
  }

  # Delete older messages
  # ttl {
  #
  # }

  tags = {
    Name = "only chats table"
  }
}
