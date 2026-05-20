// see: docs/phase3/07_transfer_engine.md §TransferContext

export type PersonContext = {
  name: string;
  nameKana: string;
  zip: string;
  addressPref: string;
  addressCity: string;
  addressTown: string;
  addressLine1: string;
  addressLine2: string;
  addressFull: string;
  addressNoPref: string;
  phone: string;
  fax: string;
  email: string;
  corporateNumber: string;
  representativeName: string;
};

export type ParcelContext = {
  pref: string;
  city: string;
  aza: string;
  chiban: string;
  locationFull: string;
  chimoku: string;
  area: string;
  tenyoArea: string;
};

export type TransferContext = {
  caseNumber: string;
  caseName: string;
  caseMemo: string;
  caseTypeLabel: string;
  submissionTarget: string;
  submissionDate: string;
  deadlineDate: string;
  today: string;
  todayYear: string;
  todayMonth: string;
  todayDay: string;

  applicant: PersonContext;
  transferee: PersonContext;
  transferor: PersonContext;
  agent: PersonContext;
  billing: PersonContext;
  neighbor: PersonContext;

  applicants: PersonContext[];
  neighbors: PersonContext[];

  parcels: ParcelContext[];
  parcel: ParcelContext;
  totalArea: string;
  totalTenyoArea: string;

  estimateAmount: string;
  estimateAmountTax: string;
  estimateAmountTotal: string;
  invoiceAmount: string;
  invoiceAmountTax: string;
  invoiceAmountTotal: string;
};
