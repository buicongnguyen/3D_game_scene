export function createSupplies(){ return {wood:0,food:0,meals:0}; }
export const MISSION={interactionRange:3.8,shotRange:35,cookSeconds:3,duskSeconds:600};
export function inReach(player,target,range=MISSION.interactionRange){
  return Math.hypot(player.x-target.x,player.y-target.y,player.z-target.z)<=range;
}
export function dinnerResult(elapsed){
  return elapsed<MISSION.duskSeconds?'Dinner before dusk — the village welcomes you!':'A late supper — no one goes hungry tonight.';
}
export function cookMeal(supplies){
  if(supplies.wood<2||supplies.food<2||supplies.meals>0) return false;
  supplies.wood-=2; supplies.food-=2; supplies.meals++; return true;
}
export function objective(supplies){
  if(supplies.meals) return 'Dinner is ready! Explore the valley or replay the mission.';
  if(supplies.wood<2||supplies.food<2) return 'Gather 2 wood and 2 food. Hunt, pick berries, or fish at the river.';
  return 'Return to camp and cook dinner.';
}
