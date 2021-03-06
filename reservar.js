const net = require('./net.js');
const util = require('util');
const dateformat = require('dateformat');

let date = new Date();
date.setDate(date.getDate() + 1);

function sendMessage(chatID, msg){
  net.request(net.message_options(chatID, msg), (err, res, body) => {
    if(err) throw err;
  });
}

net.client.query('SELECT * FROM users', (err, res) => {
  if(err) throw err;

  for(let i = 0; i < res.rows.length; i++){
    let user = {
      email: res.rows[i].email,
      pass: res.rows[i].pass,
      chatID: res.rows[i].chatid,
      credentials: null
    };

    console.log(util.format('Logging in %s', user.email))

    let reservas = JSON.parse(res.rows[i].reservas);

    net.login({email: user.email, pass: user.pass}, (err, credentials) => {
      net.request(net.negotiate_options(credentials), (err, res, body) => {
        if(err) throw err;
        credentials.connectionId = body.connectionId;
        user.credentials = credentials;

        console.log('Succesfully logged in: \n', user);

        net.request(net.calendario_options(dateformat(date, 'yyyy-mm-dd'), user.credentials.sid), (err, res, body) => {
          if(err) throw err;

          let schedules = body.calendar[0].schedules;

          if(schedules.length == 0){
            console.log('No hay reservas para mañana');
            net.client.end();
          }else{
            let algunaReserva = false;

            for(let j = 0; j < reservas.length; j++){
              let reservaDate = new Date();
              let horaReserva = reservas[j].time;

              reservaDate.setDate(reservaDate.getDate() + 1);
              reservaDate.setHours(Number(horaReserva.split(':')[0]));
              reservaDate.setMinutes(Number(horaReserva.split(':')[1]));
              reservaDate.setSeconds(0);

              date.setSeconds(1);

              if(Number(reservas[j].day) == date.getDay() && date > reservaDate){
                algunaReserva = true
                console.log('\n----------------------------\n', 'Reserva a realizar: \n', reservas[j], '\n----------------------------\n');

                let encontrada = false;

                for(let k = 0; k < schedules.length; k++){
                  if(reservas[j].activity_id == schedules[k].activity.id && reservas[j].time == schedules[k].timeStart){
                    encontrada = true;
                    console.log('\n----------------------------\n', 'Reserva encontrada: \n', schedules[k],'\n----------------------------\n')
                    switch(schedules[k].bookingState){
                      case 1:
                        net.request(net.reservar_options(credentials, schedules[k].id), (err, res, body) => {
                          if(err) throw err;

                          net.request(net.calendario_options(dateformat(date, 'yyyy-mm-dd'), user.credentials.sid), (err, res, body) => {
                            if(err) throw err;
                            let new_schedules = body.calendar[0].schedules;

                            if(reservas[j].notification == 0 && new_schedules[k].bookingState == 3) sendMessage(user.chatID, util.format('Se ha reservado la sesión de %s del %s a las %s correctamente', reservas[j].name, dateformat(date, 'dddd'),reservas[j].time));
                            if(reservas[j].notification <= 1 && new_schedules[k].bookingState != 3)sendMessage(user.chatID, util.format('Ha ocurrido un error reservando la sesión de %s del %s a las %s. Ahora mismo está en el estado %s', reservas[j].name, dateformat(date, 'dddd'),reservas[j].time, new_schedules[k].bookingStateText));

                            net.client.end();
                          });
                        });
                      break;
                      case 3:
                        console.log('Sesión ya reservada');
                        net.client.end();
                      break;
                      case 6:
                        if(reservas[j].notification <= 1) sendMessage(user.chatID, util.format('Wtf la sesión de %s del %s a las %s ha finalizado', reservas[j].name, dateformat(date, 'dddd'),reservas[j].time));
                        net.client.end();
                      break;
                      case 5:
                        if(reservas[j].notification <= 1) sendMessage(user.chatID, util.format('La sesión de %s del %s a las %s no está disponible', reservas[j].name, dateformat(date, 'dddd'),reservas[j].time));
                        net.client.end();
                      break;
                      default:
                        if(reservas[j].notification <= 1) sendMessage(user.chatID, util.format('La sesión de %s del %s a las %s está en el estado %s', reservas[j].name, dateformat(date, 'dddd'),reservas[j].time, schedules[k].bookingStateText));
                        net.client.end();
                      break;
                    }

                    break;
                  }
                }

                if(!encontrada){
                  if(reservas[j].notification <= 1) sendMessage(user.chatID, util.format('No se ha encontrado la sesión de %s del %s a las %s', reservas[j].name, dateformat(date, 'dddd'),reservas[j].time));
                  net.client.end();
                }
                break;
              }
            }
            if(!algunaReserva){
              console.log('Ninguna reserva para realizar');
              net.client.end();
            }
          }
        });
      });
    });
  }
});
