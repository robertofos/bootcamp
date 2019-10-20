import * as Yup from "yup";
import { startOfHour, parseISO, isBefore, format, subHours } from "date-fns";
import pt from "date-fns/locale/pt";
import User from "../models/Users";
import Appointment from "../models/Appointment";
import File from "../models/File";
import Notification from "../schemas/Notification";

// import CancellationMail from "../jobs/CancellationMail";
import Mail from "../../lib/Mail";
// import Queue from "../../lib/Queue";

class AppointmentController {
  async index(req, res) {
    const { page = 1 } = req.query;

    const appointments = await Appointment.findAll({
      where: { user_id: req.userId, canceled_at: null },
      order: ["date"],
      attributes: ["id", "date", "past", "cancelable"],
      limit: 20,
      offset: (page - 1) * 20,
      include: [
        {
          model: User,
          as: "provider",
          attributes: ["id", "name"],
          include: [
            {
              model: File,
              as: "avatar",
              attributes: ["id", "path", "url"]
            }
          ]
        }
      ]
    });

    return res.json(appointments);
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      provider_id: Yup.number().required(),
      date: Yup.date().required()
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: "Validate fails" });
    }
    const { provider_id, date } = req.body;
    /**
     *  Check if provider_id is a provider
     */
    const isProvider = await User.findOne({
      where: { id: provider_id, provider: true }
    });

    if (!isProvider) {
      return res
        .status(401)
        .json({ error: "you can only create appointments with providers" });
    }
    /**
     * Check for past date
     */
    const hourStar = startOfHour(parseISO(date));

    if (isBefore(hourStar, new Date())) {
      return res.status(401).json({
        error: "Past dates are not permitted, before actual date"
      });
    }
    /**
     * Check date availabity
     *
     */

    const checkAvailabity = await Appointment.findOne({
      where: {
        provider_id,
        canceled_at: null,
        date: hourStar
      }
    });

    if (checkAvailabity) {
      return res.status(401).json({
        error: "Appointment Date is not availabity"
      });
    }

    const appointment = await Appointment.create({
      user_id: req.userId,
      provider_id,
      date: hourStar
    });

    /**
     * Notify appointment provider
     */
    const user = await User.findByPk(req.userId);
    const formatttedDate = format(
      hourStar,
      "'dia' dd 'de' MMMM', às' HH:mm'h'",
      { locale: pt }
    );
    // dia 22 de junho às 8:40h

    await Notification.create({
      content: `Novo agendamento de ${user.name} para ${formatttedDate}`,
      user: provider_id
    });

    return res.json(appointment);
  }

  async delete(req, res) {
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: "provider",
          attributes: ["name", "email"]
        },
        {
          model: User,
          as: "user",
          attributes: ["name"]
        }
      ]
    });

    if (appointment.user_id !== req.userId) {
      return res.status(401).json({
        error: "You dont have permission to cancel this appointment"
      });
    }

    const datwWithSub = subHours(appointment.date, 2);

    if (isBefore(datwWithSub, new Date())) {
      return res.status(401).json({
        error: "You can only cancel appointment 2 hours in advance"
      });
    }

    appointment.canceled_at = new Date();

    await appointment.save();

    await Mail.sendMain({
      to: `${appointment.provider.name} <${appointment.provider.email}>`,
      subject: "Agendamento Cancelado",
      template: "cancellation",
      context: {
        provider: appointment.provider.name,
        user: appointment.user.name,
        date: format(appointment.date, "'dia' dd 'de' MMMM', às' HH:mm'h'", {
          locale: pt
        })
      }
    });

    /*
    // chamar a vila do https://github.com/bee-queue/bee-queue pendente
    console.log("antes de entrar de incluir na fila para o envio do email");
    await Queue.add(CancellationMail.Key, {
      appointment
    });
    console.log("apos de entrar de incluir na fila para o envio do email");
*/
    return res.json(appointment);
  }
}

export default new AppointmentController();
