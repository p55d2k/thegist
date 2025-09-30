export const getDateString = (): string => {
  const today = new Date();
  today.setHours(today.getHours());
  const yyyy = today.getFullYear();
  let mm: number | string = today.getMonth() + 1;
  let dd: number | string = today.getDate();

  if (dd < 10) dd = "0" + dd;
  if (mm < 10) mm = "0" + mm;

  const formattedToday = dd + "/" + mm + "/" + yyyy;
  return formattedToday;
};

export const getGreeting = (): string => {
  const today = new Date();
  today.setHours(today.getHours());
  const hour = today.getHours();

  if (hour <= 11) {
    return "morning";
  } else if (hour <= 16) {
    return "afternoon";
  } else {
    return "evening";
  }
};

export const getTime = (): string => {
  const today = new Date();
  today.setHours(today.getHours());
  const hour = today.getHours();

  if (hour <= 12) {
    return "Morning";
  } else {
    return "Evening";
  }
};

export const getTimeBasedGreeting = (): string => {
  const today = new Date();
  today.setHours(today.getHours());
  const hour = today.getHours();

  if (hour <= 12) {
    return "Hope you're having a good morning!";
  } else {
    return "Hope your day has been going well!";
  }
};
