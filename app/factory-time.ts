export const FACTORY_TIME_ZONE="America/Sao_Paulo";

const partsFormatter=new Intl.DateTimeFormat("en-CA",{timeZone:FACTORY_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
const displayFormatter=new Intl.DateTimeFormat("pt-BR",{timeZone:FACTORY_TIME_ZONE,dateStyle:"short",timeStyle:"medium"});

function parts(value:string|number|Date){
  return Object.fromEntries(partsFormatter.formatToParts(new Date(value)).filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
}

export function formatFactoryDateTime(value:string|null|undefined,fallback="—"){
  if(!value)return fallback;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?fallback:displayFormatter.format(date);
}

export function factoryDateTimeInput(value:string|null|undefined){
  if(!value)return"";
  const date=new Date(value);if(Number.isNaN(date.getTime()))return"";
  const p=parts(date);return`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function factoryInputToIso(value:string){
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if(!match)throw new Error("Data e hora inválidas.");
  const desired=Date.UTC(+match[1],+match[2]-1,+match[3],+match[4],+match[5],+(match[6]??0));
  let instant=desired;
  for(let attempt=0;attempt<3;attempt++){
    const p=parts(instant);const observed=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
    instant+=desired-observed;
  }
  return new Date(instant).toISOString();
}
