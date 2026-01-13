import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ExerciseListItem, ExerciseDetail } from '../models/exercises.model';

@Injectable({ providedIn: 'root' })
export class ExercisesApi {
  private readonly baseUrl = '/api/exercises';

  constructor(private http: HttpClient) {}

  list(): Observable<ExerciseListItem[]> {
    return this.http.get<ExerciseListItem[]>(this.baseUrl);
  }

  getById(id: number): Observable<ExerciseDetail> {
    return this.http.get<ExerciseDetail>(`${this.baseUrl}/${id}`);
  }
}
