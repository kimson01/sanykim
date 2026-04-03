import { useState } from 'react';
import { ticketsAPI } from '../api/client';
import { useToast } from '../components/ui';

export function useTicketPdfDownload(errorMessage = 'PDF download failed — please try again') {
  const [downloading, setDownloading] = useState(null);
  const { toast } = useToast();

  const download = async (orderId, orderRef) => {
    setDownloading(orderId);
    try {
      const res = await ticketsAPI.downloadPDF(orderId);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `sany-tickets-${orderRef}.pdf`);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode === document.body) link.remove();
      window.URL.revokeObjectURL(url);
    } catch (_) {
      toast(errorMessage, 'error');
    } finally {
      setDownloading(null);
    }
  };

  return { download, downloading };
}
