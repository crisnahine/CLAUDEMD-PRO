package com.example.models

import org.jetbrains.exposed.dao.id.IntIdTable

object Users : IntIdTable() {
    val name = varchar("name", 255)
    val email = varchar("email", 255).uniqueIndex()
}
