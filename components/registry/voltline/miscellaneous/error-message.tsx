import React from "react";

const ErrorMessage = ({ errorMsg }: { errorMsg: string }) => {
  return (
    <div className="mx-auto flex w-full max-w-max justify-center rounded-sm bg-red-900/10 px-4 text-rose-600">
      {errorMsg}
    </div>
  );
};

export default ErrorMessage;
