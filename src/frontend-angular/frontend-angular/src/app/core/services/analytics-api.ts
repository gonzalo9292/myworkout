import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type AnalyticsSummaryResponse = {
  from: string;
  to: string;
  summary: {
    workouts: number;
    exercises: number;
    sets: number;
    total_reps: number;
    total_volume: number;
  };
  by_day: Array<{ date: string; volume: number }>;
  by_exercise: Array<{ exercise: string; volume: number }>;
};

export type AnalyticsRebuildResponse = {
  range: { from: string; to: string; days: number };
  result: AnalyticsSummaryResponse;
};

@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  // Gateway/proxy: /analytics/*
  private readonly baseUrl = '/analytics';

  constructor(private http: HttpClient) {}

  summary(from: string, to: string): Observable<AnalyticsSummaryResponse> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<AnalyticsSummaryResponse>(`${this.baseUrl}/summary`, {
      params,
    });
  }

  rebuildLatest(days: number): Observable<AnalyticsRebuildResponse> {
    const params = new HttpParams().set('days', String(days));
    return this.http.post<AnalyticsRebuildResponse>(
      `${this.baseUrl}/rebuild/latest`,
      null,
      { params }
    );
  }
}
