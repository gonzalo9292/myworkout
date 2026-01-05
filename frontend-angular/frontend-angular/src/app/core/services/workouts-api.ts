// src/app/core/services/workouts-api.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WorkoutDetail, WorkoutListItem } from '../models/workouts.model';

@Injectable({ providedIn: 'root' })
export class WorkoutsApi {
  private readonly baseUrl = '/api';

  constructor(private http: HttpClient) {}

  listRecent(): Observable<WorkoutListItem[]> {
    return this.http.get<WorkoutListItem[]>(`${this.baseUrl}/workouts`);
  }

  getByDate(date: string): Observable<WorkoutListItem | null> {
    return this.http.get<WorkoutListItem | null>(
      `${this.baseUrl}/workouts?date=${encodeURIComponent(date)}`
    );
  }

  create(payload: { date: string; notes?: string | null }): Observable<any> {
    return this.http.post(`${this.baseUrl}/workouts`, payload);
  }

  getById(id: number): Observable<WorkoutDetail> {
    return this.http.get<WorkoutDetail>(`${this.baseUrl}/workouts/${id}`);
  }

  addItem(
    workoutId: number,
    payload: { exerciseId: number; position?: number; notes?: string | null }
  ): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/workouts/${workoutId}/items`,
      payload
    );
  }

  deleteItem(workoutId: number, itemId: number): Observable<any> {
    return this.http.delete(
      `${this.baseUrl}/workouts/${workoutId}/items/${itemId}`
    );
  }

  addSet(
    workoutId: number,
    itemId: number,
    payload: {
      setIndex: number;
      reps?: number | null;
      weightKg?: number | null;
    }
  ): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/workouts/${workoutId}/items/${itemId}/sets`,
      payload
    );
  }

  deleteSet(workoutId: number, itemId: number, setId: number): Observable<any> {
    return this.http.delete(
      `${this.baseUrl}/workouts/${workoutId}/items/${itemId}/sets/${setId}`
    );
  }
}
