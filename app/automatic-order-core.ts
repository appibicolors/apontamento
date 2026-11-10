import type {Ordem} from "./supabase";

export function normalizedOpNumber(value:string){return value.trim().replace(/^0+(?=\d)/,"")}
export function findKnownOrder(orders:Ordem[],number:string){const normalized=normalizedOpNumber(number);return orders.find(item=>normalizedOpNumber(item.numero_op)===normalized)}
