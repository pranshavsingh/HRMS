export default function Card({ title, value, icon }) {
  return (
    <div className="bg-white rounded-xl shadow p-5 flex items-center justify-between hover:shadow-md transition">

      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <h2 className="text-2xl font-bold mt-1">{value}</h2>
      </div>

      <div className="text-blue-600">
        {icon}
      </div>

    </div>
  );
}