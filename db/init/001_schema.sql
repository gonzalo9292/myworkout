CREATE DATABASE IF NOT EXISTS myworkout;
USE myworkout;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'USER',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email)
);

-- MUSCLES
CREATE TABLE IF NOT EXISTS muscles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wger_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_muscles_wger_id (wger_id)
);

-- EXERCISES
CREATE TABLE IF NOT EXISTS exercises (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wger_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description_html TEXT NULL,
  description_text TEXT NULL,
  image_url TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_exercises_wger_id (wger_id),
  KEY ix_exercises_name (name)
);

-- N:M EXERCISE <-> MUSCLES
CREATE TABLE IF NOT EXISTS exercise_muscles (
  exercise_id BIGINT UNSIGNED NOT NULL,
  muscle_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (exercise_id, muscle_id),
  CONSTRAINT fk_em_exercise
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_em_muscle
    FOREIGN KEY (muscle_id) REFERENCES muscles(id)
    ON DELETE CASCADE
);
-- ===============================
-- ROUTINES
-- ===============================
CREATE TABLE IF NOT EXISTS routines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id)
);

-- ===============================
-- ROUTINE ITEMS (ejercicios dentro de una rutina)
-- ===============================
CREATE TABLE IF NOT EXISTS routine_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  routine_id BIGINT UNSIGNED NOT NULL,
  exercise_id BIGINT UNSIGNED NOT NULL,
  position INT NOT NULL DEFAULT 1,
  sets INT NULL,
  reps VARCHAR(50) NULL,
  notes VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY ix_ri_routine (routine_id),
  KEY ix_ri_exercise (exercise_id),
  CONSTRAINT fk_ri_routine
    FOREIGN KEY (routine_id) REFERENCES routines(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ri_exercise
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS workouts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workout_date DATE NOT NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_workout_date (workout_date)
);
CREATE TABLE IF NOT EXISTS workout_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workout_id BIGINT UNSIGNED NOT NULL,
  exercise_id BIGINT UNSIGNED NOT NULL,
  position INT NOT NULL DEFAULT 1,
  notes VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY ix_wi_workout (workout_id),
  KEY ix_wi_exercise (exercise_id),
  CONSTRAINT fk_wi_workout
    FOREIGN KEY (workout_id) REFERENCES workouts(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_wi_exercise
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS workout_sets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workout_item_id BIGINT UNSIGNED NOT NULL,
  set_index INT NOT NULL,
  reps INT NULL,
  weight_kg DECIMAL(6,2) NULL,
  PRIMARY KEY (id),
  KEY ix_ws_item (workout_item_id),
  CONSTRAINT fk_ws_item
    FOREIGN KEY (workout_item_id) REFERENCES workout_items(id)
    ON DELETE CASCADE
);



