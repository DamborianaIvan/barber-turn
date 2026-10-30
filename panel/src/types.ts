export type Shop = {
  name: string;
  phone: string;
  address: string;
  duration: number;
  horizon: number;
  timezone: string;
};
export type Settings = Omit<Shop, "timezone"> & {
  revision: number;
  weekly: Record<string, [string, string][]>;
};
export type Slot = { id: string; start: string; end: string };
export type Client = {
  _id: string;
  name: string;
  phone: string;
  notes: string;
  revision: number;
};
export type Booking = {
  _id: string;
  slot: string;
  client: Client | string;
  name: string;
  phone: string;
  start: string;
  end: string;
  status: "confirmado" | "atendido" | "cancelado" | "ausente";
  revision: number;
  source: string;
};
export type Block = { _id: string; start: string; end: string; reason: string };
export type Agenda = {
  slots: { _id: string; start: string; end: string }[];
  bookings: Booking[];
  blocks: Block[];
};
