package com.example.routes

import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.userRoutes() {
    route("/api/users") {
        get { call.respondText("Users list") }
        post { call.respondText("User created") }
    }
}
