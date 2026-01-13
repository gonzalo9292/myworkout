// src/app/core/models/workouts.model.ts

export type WorkoutListItem = {
  id: number;
  workout_date: string; // "YYYY-MM-DD"
  notes: string | null;
  created_at: string | Date;
};

export type WorkoutSet = {
  id: number;
  workout_item_id: number;
  set_index: number;
  reps: number | null;
  weight_kg: number | null;
};

export type WorkoutItem = {
  id: number;
  workout_id: number;
  exercise_id: number;
  position: number;
  notes: string | null;

  exercise_name: string;
  exercise_image_url: string | null;

  sets: WorkoutSet[];
};

export type WorkoutDetail = WorkoutListItem & {
  items: WorkoutItem[];
};
