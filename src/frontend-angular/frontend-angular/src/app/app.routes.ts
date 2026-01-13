import { Routes } from '@angular/router';
import { ExercisesPage } from './pages/exercises/exercises-page/exercises-page';
import { AnalyticsPage } from './pages/analitycs/analytics-page/analytics-page';
import { HistorialPage } from './pages/historial/historial-page/historial-page';
import { ExerciseDetailPage } from './pages/exercises/exercise-detail-page/exercise-detail-page';
import { RoutinesPage } from './pages/routines/routines-page/routines-page';
import { RoutineDetailPage } from './pages/routines/routine-detail-page/routine-detail-page';
import { WorkoutsPage } from './pages/workouts/workouts-page/workouts-page';
import { WorkoutDetailPage } from './pages/workouts/workout-detail-page/workout-detail-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'exercises' },
  { path: 'exercises', component: ExercisesPage },
  { path: 'exercises/:id', component: ExerciseDetailPage },
  { path: 'routines', component: RoutinesPage },
  { path: 'routines/:id', component: RoutineDetailPage },
  { path: 'workouts', component: WorkoutsPage },
  { path: 'workouts/:id', component: WorkoutDetailPage },
  { path: 'progress', component: AnalyticsPage },
  { path: 'historial', component: HistorialPage },
  { path: '**', redirectTo: 'exercises' },
];
