"use server";

import {
  getIndicatorRequests,
  type GetIndicatorRequestsParams,
  type IndicatorRequestsPage,
} from "@/server/services/indicators.service";

/**
 * Puente de solo lectura entre el modal de detalle de indicador (cliente) y
 * `getIndicatorRequests`. No modifica ningún dato — expone la misma consulta
 * que ya usa cada KPI/tarjeta de /indicadores, para que el número del KPI y
 * el total mostrado en el modal nunca puedan divergir.
 */
export async function fetchIndicatorRequests(
  params: GetIndicatorRequestsParams,
): Promise<IndicatorRequestsPage> {
  return getIndicatorRequests(params);
}
