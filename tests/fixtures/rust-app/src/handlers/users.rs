use actix_web::{web, HttpResponse};
use serde::Deserialize;
use uuid::Uuid;

use crate::models::user::{CreateUser, User};

#[derive(Deserialize)]
pub struct UserPath {
    id: Uuid,
}

pub async fn list() -> HttpResponse {
    // In a real app, query the database
    let users: Vec<User> = vec![];
    HttpResponse::Ok().json(users)
}

pub async fn create(body: web::Json<CreateUser>) -> HttpResponse {
    let user = User {
        id: Uuid::new_v4(),
        email: body.email.clone(),
        name: body.name.clone(),
        created_at: chrono::Utc::now().naive_utc(),
    };
    HttpResponse::Created().json(user)
}

pub async fn get_by_id(path: web::Path<UserPath>) -> HttpResponse {
    let _id = path.id;
    // In a real app, query the database by id
    HttpResponse::NotFound().json(serde_json::json!({
        "error": "User not found"
    }))
}

pub async fn delete(path: web::Path<UserPath>) -> HttpResponse {
    let _id = path.id;
    // In a real app, delete from database
    HttpResponse::NoContent().finish()
}
