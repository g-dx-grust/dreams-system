import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PersonForm } from "@/components/persons/person-form";
import { getPerson } from "@/server/persons";
import type { PersonUpsertInput } from "@/lib/validators/person";

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getPerson(Number(id));
  if (!res.ok) notFound();
  const p = res.data;

  const defaults: Partial<PersonUpsertInput> = {
    person_type: p.person_type,
    default_case_role: p.default_case_role ?? "",
    name: p.name,
    name_kana: p.name_kana ?? "",
    zip: p.zip ?? "",
    address_pref: p.address_pref ?? "",
    address_city: p.address_city ?? "",
    address_town: p.address_town ?? "",
    address_line1: p.address_line1 ?? "",
    address_line2: p.address_line2 ?? "",
    phone: p.phone ?? "",
    fax: p.fax ?? "",
    email: p.email ?? "",
    corporate_number: p.corporate_number ?? "",
    representative_name: p.representative_name ?? "",
    memo: p.memo ?? "",
  };

  return (
    <>
      <PageHeader title={`${p.name} を編集する`} />
      <PersonForm mode="edit" personId={p.id} defaultValues={defaults} />
    </>
  );
}
