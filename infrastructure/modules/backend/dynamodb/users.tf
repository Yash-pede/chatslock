# ----USERS TABLE----
resource "aws_dynamodb_table" "environment" {
  name         = "users"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "username"
    type = "S"
  }

  attribute {
    name = "phone"
    type = "S"
  }

  attribute {
    name = "role"
    type = "S"
  }

  attribute {
    name = "lastActiveAt"
    type = "N"
  }

  attribute {
    name = "agentId"
    type = "S"
  }

  global_secondary_index {
    name = "agentId_GSI"
    key_schema {
      attribute_name = "agentId"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "lastActiveAt"
      key_type       = "RANGE"
    }
    projection_type = "ALL"
  }

  global_secondary_index {
    name = "username_GSI"
    key_schema {
      attribute_name = "username"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "lastActiveAt"
      key_type       = "RANGE"
    }
    projection_type = "ALL"
  }

  global_secondary_index {
    name = "phone_GSI"
    key_schema {
      attribute_name = "phone"
      key_type       = "HASH"
    }

    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "role_lastActiveAt_GSI"
    projection_type = "ALL"

    key_schema {
      attribute_name = "role"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "lastActiveAt"
      key_type       = "RANGE"
    }
  }

  lifecycle {
#    prevent_destroy = true
    ignore_changes  = [read_capacity, write_capacity]
  }

  tags = {
    Name = "UsersTable"
  }
}
