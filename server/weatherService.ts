// Weather service using Open-Meteo API (completely free, no API key required)
export interface WeatherData {
  location: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  condition: string;
  time: string;
}

export interface ForecastData {
  date: string;
  maxTemp: number;
  minTemp: number;
  condition: string;
  precipitationChance: number;
}

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  name: string;
  country: string;
}

export class WeatherService {
  private readonly geocodingApiUrl = 'https://geocoding-api.open-meteo.com/v1/search';
  private readonly weatherApiUrl = 'https://api.open-meteo.com/v1/forecast';

  // Get coordinates for a location
  async getLocationCoordinates(location: string): Promise<LocationCoordinates | null> {
    try {
      const response = await fetch(`${this.geocodingApiUrl}?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
      
      if (!response.ok) {
        throw new Error(`Geocoding API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.results || data.results.length === 0) {
        return null;
      }

      const result = data.results[0];
      return {
        latitude: result.latitude,
        longitude: result.longitude,
        name: result.name,
        country: result.country || ''
      };
    } catch (error) {
      console.error('Error getting location coordinates:', error);
      return null;
    }
  }

  // Get current weather for coordinates
  async getCurrentWeather(latitude: number, longitude: number, locationName: string): Promise<WeatherData | null> {
    try {
      const response = await fetch(
        `${this.weatherApiUrl}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&timezone=auto`
      );

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const data = await response.json();
      const current = data.current;

      return {
        location: locationName,
        temperature: Math.round(current.temperature_2m),
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        windDirection: current.wind_direction_10m,
        condition: this.getWeatherCondition(current.weather_code),
        time: current.time
      };
    } catch (error) {
      console.error('Error getting current weather:', error);
      return null;
    }
  }

  // Get weather forecast for coordinates
  async getWeatherForecast(latitude: number, longitude: number, days: number = 5): Promise<ForecastData[]> {
    try {
      const response = await fetch(
        `${this.weatherApiUrl}?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=auto&forecast_days=${days}`
      );

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const data = await response.json();
      const daily = data.daily;

      return daily.time.map((date: string, index: number) => ({
        date,
        maxTemp: Math.round(daily.temperature_2m_max[index]),
        minTemp: Math.round(daily.temperature_2m_min[index]),
        condition: this.getWeatherCondition(daily.weather_code[index]),
        precipitationChance: daily.precipitation_probability_max[index] || 0
      }));
    } catch (error) {
      console.error('Error getting weather forecast:', error);
      return [];
    }
  }

  // Get weather for a location by name
  async getWeatherByLocation(location: string): Promise<{ current: WeatherData | null; forecast: ForecastData[] }> {
    const coordinates = await this.getLocationCoordinates(location);
    
    if (!coordinates) {
      return { current: null, forecast: [] };
    }

    const current = await this.getCurrentWeather(
      coordinates.latitude, 
      coordinates.longitude, 
      `${coordinates.name}, ${coordinates.country}`
    );
    
    const forecast = await this.getWeatherForecast(
      coordinates.latitude, 
      coordinates.longitude
    );

    return { current, forecast };
  }

  // Convert weather codes to human-readable conditions
  private getWeatherCondition(code: number): string {
    const weatherCodes: { [key: number]: string } = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Fog',
      48: 'Depositing rime fog',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Dense drizzle',
      56: 'Light freezing drizzle',
      57: 'Dense freezing drizzle',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      66: 'Light freezing rain',
      67: 'Heavy freezing rain',
      71: 'Slight snow fall',
      73: 'Moderate snow fall',
      75: 'Heavy snow fall',
      77: 'Snow grains',
      80: 'Slight rain showers',
      81: 'Moderate rain showers',
      82: 'Violent rain showers',
      85: 'Slight snow showers',
      86: 'Heavy snow showers',
      95: 'Thunderstorm',
      96: 'Thunderstorm with slight hail',
      99: 'Thunderstorm with heavy hail'
    };

    return weatherCodes[code] || 'Unknown';
  }

  // Format weather for conversational response
  formatWeatherResponse(weatherData: { current: WeatherData | null; forecast: ForecastData[] }, includeTitle: boolean = true): string {
    if (!weatherData.current) {
      return "I'm sorry, dear. I couldn't get the weather information for that location. Could you try a different city name?";
    }

    const { current } = weatherData;
    let response = '';
    
    if (includeTitle) {
      response += `Here's the current weather in ${current.location}:\n\n`;
    }
    
    response += `🌡️ Temperature: ${current.temperature}°C\n`;
    response += `☁️ Conditions: ${current.condition}\n`;
    response += `💧 Humidity: ${current.humidity}%\n`;
    response += `💨 Wind: ${current.windSpeed} km/h\n`;

    if (weatherData.forecast.length > 0) {
      response += '\n📅 5-day forecast:\n';
      weatherData.forecast.forEach((day, index) => {
        if (index < 5) {
          const date = new Date(day.date);
          const dayName = index === 0 ? 'Today' : 
                         index === 1 ? 'Tomorrow' : 
                         date.toLocaleDateString('en-US', { weekday: 'short' });
          
          response += `${dayName}: ${day.maxTemp}°C/${day.minTemp}°C, ${day.condition}`;
          if (day.precipitationChance > 0) {
            response += ` (${day.precipitationChance}% rain)`;
          }
          response += '\n';
        }
      });
    }

    return response;
  }
}