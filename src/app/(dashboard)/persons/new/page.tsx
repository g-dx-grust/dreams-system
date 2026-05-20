import { PageHeader } from "@/components/ui/page-header";
import { PersonForm } from "@/components/persons/person-form";

export default function NewPersonPage() {
  return (
    <>
      <PageHeader
        title="関係者を登録する"
        description="入力した内容は案件への紐付け時にスナップショットとしてコピーされます。"
      />
      <PersonForm mode="create" />
    </>
  );
}
