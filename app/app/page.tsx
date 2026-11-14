import KotiApp from '@/components/koti-app';
import { transactions } from '@/lib/server-data';
import { defaults,forecast } from '@/lib/finance';
export default function Home(){return <KotiApp initialForecast={forecast(transactions,defaults)}/>;}
