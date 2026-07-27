import { useCallback, useEffect, useState } from 'react';
import { updateDestinationCity, type Interest } from '../domain/trip';
import { useTrip } from '../state/tripStore';
import { CityShowcase } from './CityShowcase';
import { LandingPlannerDialog } from './LandingPlannerDialog';

type LandingPageProps = {
  onStartPlanning: () => void;
};

export function LandingPage({ onStartPlanning }: LandingPageProps) {
  const { request, updateRequest } = useTrip();
  const [plannerOpen, setPlannerOpen] = useState(false);
  const closePlanner = useCallback(() => setPlannerOpen(false), []);

  useEffect(() => {
    const openPlanner = () => setPlannerOpen(true);
    window.addEventListener('landing:plan-open', openPlanner);
    return () => window.removeEventListener('landing:plan-open', openPlanner);
  }, []);

  const selectCity = (city: Parameters<typeof updateDestinationCity>[1]) => {
    const next = updateDestinationCity(request, city);
    updateRequest({ destinationCity: next.destinationCity, origin: next.origin });
  };

  const addInterest = (interest: Interest) => {
    if (!request.interests.includes(interest)) updateRequest({ interests: [...request.interests, interest] });
  };

  return (
    <main className="landing-editorial" aria-label="湖北六城首页">
      <CityShowcase city={request.destinationCity} interests={request.interests} onCityChange={selectCity} onInterestAdd={addInterest} onStartPlanning={() => setPlannerOpen(true)} externallyPaused={plannerOpen} />
      <LandingPlannerDialog open={plannerOpen} onClose={closePlanner} onContinue={onStartPlanning} />
    </main>
  );
}
