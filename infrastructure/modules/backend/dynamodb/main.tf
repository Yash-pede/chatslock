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
    name = "lastMessageAt"
    type = "N"
  }

  attribute {
    name = "messageId"
    type = "N"
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
      attribute_name = "PK"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "lastMessageAt"
      key_type       = "RANGE"
    }
  }

  global_secondary_index {
    name            = "MessageIdSequence_GSI"
    projection_type = "ALL"

    key_schema {
      attribute_name = "PK"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "messageId"
      key_type       = "RANGE"
    }
  }

  lifecycle {
    #    prevent_destroy = true
    ignore_changes = [read_capacity, write_capacity]
  }

  # `expiresAt` (epoch seconds) sweeps 30-day-old messages and stale rows.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = {
    Name = "only chats table"
  }
}
