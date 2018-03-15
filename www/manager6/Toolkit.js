// ExtJS related things

Proxmox.Utils.toolkit = 'extjs';

// custom PVE specific VTypes
Ext.apply(Ext.form.field.VTypes, {

    QemuStartDate: function(v) {
	return (/^(now|\d{4}-\d{1,2}-\d{1,2}(T\d{1,2}:\d{1,2}:\d{1,2})?)$/).test(v);
    },
    QemuStartDateText: gettext('Format') + ': "now" or "2006-06-17T16:01:21" or "2006-06-17"',
    IP64AddressList: function(v) {
	var list = v.split(/[\ \,\;]+/);
	var i;
	for (i = 0; i < list.length; i++) {
	    if (list[i] == '') {
		continue;
	    }

	    if (!Proxmox.Utils.IP64_match.test(list[i])) {
		return false;
	    }
	}

	return true;
    },
    IP64AddressListText: gettext('Example') + ': 192.168.1.1,192.168.1.2',
    IP64AddressListMask: /[A-Fa-f0-9\,\:\.\;\ ]/
});
