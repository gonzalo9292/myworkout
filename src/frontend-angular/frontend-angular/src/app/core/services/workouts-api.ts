// src/app/core/services/workouts-api.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { WorkoutDetail, WorkoutListItem } from '../models/workouts.model';

@Injectable({ providedIn: 'root' })
export class WorkoutsApi {
  private readonly baseUrl = '/api';

  constructor(private http: HttpClient) {}

  // GET /workouts  -> últimos 30 (tu backend)
  listRecent(): Observable<WorkoutListItem[]> {
    return this.http.get<WorkoutListItem[]>(`${this.baseUrl}/workouts`);
  }

  // GET /workouts?date=YYYY-MM-DD -> devuelve workout o null (tu backend)
  getByDate(date: string): Observable<{ id: number } | null> {
    const params = new HttpParams().set('date', date);
    return this.http.get<{ id: number } | null>(`${this.baseUrl}/workouts`, {
      params,
    });
  }

  // GET /workouts/:id -> detalle
  getById(id: number): Observable<WorkoutDetail> {
    return this.http.get<WorkoutDetail>(`${this.baseUrl}/workouts/${id}`);
  }

  // POST /workouts -> crear (y opcionalmente copiar rutina si backend lo soporta)
  create(payload: {
    date: string;
    notes?: string | null;
    routineId?: number | null;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/workouts`, payload);
  }

  // DELETE /workouts/:id -> borrar entrenamiento (asumido por ti)
  delete(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/workouts/${id}`);
  }

  // items
  addItem(
    workoutId: number,
    payload: { exerciseId: number; notes?: string | null }
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

  // sets
  addSet(
    workoutId: number,
    itemId: number,
    payload: { setIndex: number; reps: number | null; weightKg: number | null }
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
