import { Routes } from '@angular/router';
import { ExercisesPage } from './pages/exercises/exercises-page';
import { AnalyticsPage } from './pages/analitycs/analytics-page';
import { LoginPage } from './pages/auth/login-page';
import { ExerciseDetailPage } from './pages/exercises/exercise-detail-page';
import { RoutinesPage } from './pages/routines/routines-page';
import { RoutineDetailPage } from './pages/routines/routine-detail-page';
import { WorkoutsPage } from './pages/workouts/workouts-page';
import { WorkoutDetailPage } from './pages/workouts/workout-detail-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'exercises' },
  { path: 'exercises', component: ExercisesPage },
  { path: 'exercises/:id', component: ExerciseDetailPage }, // <-- NUEVO
  { path: 'routines', component: RoutinesPage },
  { path: 'routines/:id', component: RoutineDetailPage },
  { path: 'workouts', component: WorkoutsPage },
  { path: 'workouts/:id', component: WorkoutDetailPage },
  { path: 'progress', component: AnalyticsPage },
  { path: 'login', component: LoginPage },
  { path: '**', redirectTo: 'exercises' },
];
