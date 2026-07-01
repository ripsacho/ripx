import styles from './ShippingStudio.module.css';

export default function ShippingStudio({ children }) {
  return <div className={styles.shippingStudioRoot}>{children}</div>;
}
