use actix_web::{web, App, HttpServer, middleware};
use tracing_actix_web::TracingLogger;

mod handlers;
mod models;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter("my_api=debug,actix_web=info")
        .init();

    tracing::info!("Starting server at http://127.0.0.1:8080");

    HttpServer::new(|| {
        App::new()
            .wrap(TracingLogger::default())
            .wrap(middleware::Compress::default())
            .service(
                web::scope("/api")
                    .route("/health", web::get().to(handlers::health))
                    .route("/users", web::get().to(handlers::users::list))
                    .route("/users", web::post().to(handlers::users::create))
                    .route("/users/{id}", web::get().to(handlers::users::get_by_id))
                    .route("/users/{id}", web::delete().to(handlers::users::delete)),
            )
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
