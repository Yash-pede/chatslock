# ----USERS TABLE----
resource "aws_dynamodb_table" "environment" {
  name         = "users"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "userId"
  range_key = "created_at"

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
    name = "last_active_at"
    type = "N"
  }

  attribute {
    name = "created_at"
    type = "N"
  }

  global_secondary_index {
    name = "username_GSI"
    key_schema {
      attribute_name = "username"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "last_active_at"
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
    name            = "role_last_active_GSI"
    projection_type = "ALL"

    key_schema {
      attribute_name = "role"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "last_active_at"
      key_type       = "RANGE"
    }
  }

  local_secondary_index {
    name            = "user_last_active_at_LSI"
    range_key       = "last_active_at"
    projection_type = "ALL"
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [read_capacity, write_capacity]
  }

  tags = {
    Name = "UsersTable"
  }
}
