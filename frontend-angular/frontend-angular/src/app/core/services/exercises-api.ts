import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ExerciseListItem } from '../models/exercises.model';

@Injectable({ providedIn: 'root' })
export class ExercisesApi {
  private readonly baseUrl = '/api';

  constructor(private http: HttpClient) {}

  list(): Observable<ExerciseListItem[]> {
    return this.http.get<ExerciseListItem[]>(`${this.baseUrl}/exercises`);
  }

  getById(id: number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/exercises/${id}`);
  }
}
