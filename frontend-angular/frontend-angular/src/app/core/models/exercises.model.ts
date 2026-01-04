export interface ExerciseListItem {
  id: number;
  wger_id: number;
  name: string;
  description_text: string | null;
  image_url: string | null;
}

export interface Muscle {
  id: number;
  wger_id: number;
  name: string;
}

export interface ExerciseDetail extends ExerciseListItem {
  description_html?: string | null;
  muscles: Muscle[];
}
