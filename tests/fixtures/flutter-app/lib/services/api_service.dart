import 'package:dio/dio.dart';

class ApiService {
  final Dio _dio = Dio(BaseOptions(baseUrl: 'https://api.example.com'));

  Future<Response> getUsers() => _dio.get('/users');
  Future<Response> getUser(String id) => _dio.get('/users/$id');
}
