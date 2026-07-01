import React from 'react';
import styles from './SettingsPrimitives.module.css';

export function SettingsTabIntro({ eyebrow, title, description }) {
  if (!title && !description) return null;
  return (
    <div className={styles.settingsTabIntro}>
      {eyebrow ? <p className={styles.settingsTabIntroEyebrow}>{eyebrow}</p> : null}
      {title ? <h2 className={styles.settingsTabIntroTitle}>{title}</h2> : null}
      {description ? <p className={styles.settingsTabIntroDescription}>{description}</p> : null}
    </div>
  );
}
