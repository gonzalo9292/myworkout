import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type RoutineListItem = {
  id: number;
  name: string;
  notes: string | null;
};

export type RoutineDetail = RoutineListItem & {
  items: Array<{
    id: number;
    routine_id: number;
    exercise_id: number;
    position: number;
    sets: number | null;
    reps: string | null;
    weight_kg: number | null;
    notes: string | null;
    exercise_name: string;
    exercise_image_url: string | null;
  }>;
};

@Injectable({ providedIn: 'root' })
export class RoutinesApi {
  private readonly baseUrl = '/api';

  constructor(private http: HttpClient) {}

  list(): Observable<RoutineListItem[]> {
    return this.http.get<RoutineListItem[]>(`${this.baseUrl}/routines`);
  }

  create(payload: { name: string; notes?: string | null }): Observable<any> {
    return this.http.post(`${this.baseUrl}/routines`, payload);
  }

  getById(id: number): Observable<RoutineDetail> {
    return this.http.get<RoutineDetail>(`${this.baseUrl}/routines/${id}`);
  }

  addItem(
    routineId: number,
    payload: {
      exerciseId: number;
      position?: number;
      sets?: number | null;
      reps?: string | null;
      weightKg?: number | null;
      notes?: string | null;
    }
  ): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/routines/${routineId}/items`,
      payload
    );
  }

  deleteItem(routineId: number, itemId: number): Observable<any> {
    return this.http.delete(
      `${this.baseUrl}/routines/${routineId}/items/${itemId}`
    );
  }
}
