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
