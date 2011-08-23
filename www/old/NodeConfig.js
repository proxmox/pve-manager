Ext.ns("PVE");

var timezones = [
    ['Africa/Abidjan'],
    ['Africa/Accra'],
    ['Africa/Addis_Ababa'],
    ['Africa/Algiers'],
    ['Africa/Asmara'],
    ['Africa/Bamako'],
    ['Africa/Bangui'],
    ['Africa/Banjul'],
    ['Africa/Bissau'],
    ['Africa/Blantyre'],
    ['Africa/Brazzaville'],
    ['Africa/Bujumbura'],
    ['Africa/Cairo'],
    ['Africa/Casablanca'],
    ['Africa/Ceuta'],
    ['Africa/Conakry'],
    ['Africa/Dakar'],
    ['Africa/Dar_es_Salaam'],
    ['Africa/Djibouti'],
    ['Africa/Douala'],
    ['Africa/El_Aaiun'],
    ['Africa/Freetown'],
    ['Africa/Gaborone'],
    ['Africa/Harare'],
    ['Africa/Johannesburg'],
    ['Africa/Kampala'],
    ['Africa/Khartoum'],
    ['Africa/Kigali'],
    ['Africa/Kinshasa'],
    ['Africa/Lagos'],
    ['Africa/Libreville'],
    ['Africa/Lome'],
    ['Africa/Luanda'],
    ['Africa/Lubumbashi'],
    ['Africa/Lusaka'],
    ['Africa/Malabo'],
    ['Africa/Maputo'],
    ['Africa/Maseru'],
    ['Africa/Mbabane'],
    ['Africa/Mogadishu'],
    ['Africa/Monrovia'],
    ['Africa/Nairobi'],
    ['Africa/Ndjamena'],
    ['Africa/Niamey'],
    ['Africa/Nouakchott'],
    ['Africa/Ouagadougou'],
    ['Africa/Porto-Novo'],
    ['Africa/Sao_Tome'],
    ['Africa/Tripoli'],
    ['Africa/Tunis'],
    ['Africa/Windhoek'],
    ['America/Adak'],
    ['America/Anchorage'],
    ['America/Anguilla'],
    ['America/Antigua'],
    ['America/Araguaina'],
    ['America/Argentina/Buenos_Aires'],
    ['America/Argentina/Catamarca'],
    ['America/Argentina/Cordoba'],
    ['America/Argentina/Jujuy'],
    ['America/Argentina/La_Rioja'],
    ['America/Argentina/Mendoza'],
    ['America/Argentina/Rio_Gallegos'],
    ['America/Argentina/Salta'],
    ['America/Argentina/San_Juan'],
    ['America/Argentina/San_Luis'],
    ['America/Argentina/Tucuman'],
    ['America/Argentina/Ushuaia'],
    ['America/Aruba'],
    ['America/Asuncion'],
    ['America/Atikokan'],
    ['America/Bahia'],
    ['America/Bahia_Banderas'],
    ['America/Barbados'],
    ['America/Belem'],
    ['America/Belize'],
    ['America/Blanc-Sablon'],
    ['America/Boa_Vista'],
    ['America/Bogota'],
    ['America/Boise'],
    ['America/Cambridge_Bay'],
    ['America/Campo_Grande'],
    ['America/Cancun'],
    ['America/Caracas'],
    ['America/Cayenne'],
    ['America/Cayman'],
    ['America/Chicago'],
    ['America/Chihuahua'],
    ['America/Costa_Rica'],
    ['America/Cuiaba'],
    ['America/Curacao'],
    ['America/Danmarkshavn'],
    ['America/Dawson'],
    ['America/Dawson_Creek'],
    ['America/Denver'],
    ['America/Detroit'],
    ['America/Dominica'],
    ['America/Edmonton'],
    ['America/Eirunepe'],
    ['America/El_Salvador'],
    ['America/Fortaleza'],
    ['America/Glace_Bay'],
    ['America/Godthab'],
    ['America/Goose_Bay'],
    ['America/Grand_Turk'],
    ['America/Grenada'],
    ['America/Guadeloupe'],
    ['America/Guatemala'],
    ['America/Guayaquil'],
    ['America/Guyana'],
    ['America/Halifax'],
    ['America/Havana'],
    ['America/Hermosillo'],
    ['America/Indiana/Indianapolis'],
    ['America/Indiana/Knox'],
    ['America/Indiana/Marengo'],
    ['America/Indiana/Petersburg'],
    ['America/Indiana/Tell_City'],
    ['America/Indiana/Vevay'],
    ['America/Indiana/Vincennes'],
    ['America/Indiana/Winamac'],
    ['America/Inuvik'],
    ['America/Iqaluit'],
    ['America/Jamaica'],
    ['America/Juneau'],
    ['America/Kentucky/Louisville'],
    ['America/Kentucky/Monticello'],
    ['America/La_Paz'],
    ['America/Lima'],
    ['America/Los_Angeles'],
    ['America/Maceio'],
    ['America/Managua'],
    ['America/Manaus'],
    ['America/Marigot'],
    ['America/Martinique'],
    ['America/Matamoros'],
    ['America/Mazatlan'],
    ['America/Menominee'],
    ['America/Merida'],
    ['America/Mexico_City'],
    ['America/Miquelon'],
    ['America/Moncton'],
    ['America/Monterrey'],
    ['America/Montevideo'],
    ['America/Montreal'],
    ['America/Montserrat'],
    ['America/Nassau'],
    ['America/New_York'],
    ['America/Nipigon'],
    ['America/Nome'],
    ['America/Noronha'],
    ['America/North_Dakota/Center'],
    ['America/North_Dakota/New_Salem'],
    ['America/Ojinaga'],
    ['America/Panama'],
    ['America/Pangnirtung'],
    ['America/Paramaribo'],
    ['America/Phoenix'],
    ['America/Port-au-Prince'],
    ['America/Port_of_Spain'],
    ['America/Porto_Velho'],
    ['America/Puerto_Rico'],
    ['America/Rainy_River'],
    ['America/Rankin_Inlet'],
    ['America/Recife'],
    ['America/Regina'],
    ['America/Resolute'],
    ['America/Rio_Branco'],
    ['America/Santa_Isabel'],
    ['America/Santarem'],
    ['America/Santiago'],
    ['America/Santo_Domingo'],
    ['America/Sao_Paulo'],
    ['America/Scoresbysund'],
    ['America/Shiprock'],
    ['America/St_Barthelemy'],
    ['America/St_Johns'],
    ['America/St_Kitts'],
    ['America/St_Lucia'],
    ['America/St_Thomas'],
    ['America/St_Vincent'],
    ['America/Swift_Current'],
    ['America/Tegucigalpa'],
    ['America/Thule'],
    ['America/Thunder_Bay'],
    ['America/Tijuana'],
    ['America/Toronto'],
    ['America/Tortola'],
    ['America/Vancouver'],
    ['America/Whitehorse'],
    ['America/Winnipeg'],
    ['America/Yakutat'],
    ['America/Yellowknife'],
    ['Antarctica/Casey'],
    ['Antarctica/Davis'],
    ['Antarctica/DumontDUrville'],
    ['Antarctica/Macquarie'],
    ['Antarctica/Mawson'],
    ['Antarctica/McMurdo'],
    ['Antarctica/Palmer'],
    ['Antarctica/Rothera'],
    ['Antarctica/South_Pole'],
    ['Antarctica/Syowa'],
    ['Antarctica/Vostok'],
    ['Arctic/Longyearbyen'],
    ['Asia/Aden'],
    ['Asia/Almaty'],
    ['Asia/Amman'],
    ['Asia/Anadyr'],
    ['Asia/Aqtau'],
    ['Asia/Aqtobe'],
    ['Asia/Ashgabat'],
    ['Asia/Baghdad'],
    ['Asia/Bahrain'],
    ['Asia/Baku'],
    ['Asia/Bangkok'],
    ['Asia/Beirut'],
    ['Asia/Bishkek'],
    ['Asia/Brunei'],
    ['Asia/Choibalsan'],
    ['Asia/Chongqing'],
    ['Asia/Colombo'],
    ['Asia/Damascus'],
    ['Asia/Dhaka'],
    ['Asia/Dili'],
    ['Asia/Dubai'],
    ['Asia/Dushanbe'],
    ['Asia/Gaza'],
    ['Asia/Harbin'],
    ['Asia/Ho_Chi_Minh'],
    ['Asia/Hong_Kong'],
    ['Asia/Hovd'],
    ['Asia/Irkutsk'],
    ['Asia/Jakarta'],
    ['Asia/Jayapura'],
    ['Asia/Jerusalem'],
    ['Asia/Kabul'],
    ['Asia/Kamchatka'],
    ['Asia/Karachi'],
    ['Asia/Kashgar'],
    ['Asia/Kathmandu'],
    ['Asia/Kolkata'],
    ['Asia/Krasnoyarsk'],
    ['Asia/Kuala_Lumpur'],
    ['Asia/Kuching'],
    ['Asia/Kuwait'],
    ['Asia/Macau'],
    ['Asia/Magadan'],
    ['Asia/Makassar'],
    ['Asia/Manila'],
    ['Asia/Muscat'],
    ['Asia/Nicosia'],
    ['Asia/Novokuznetsk'],
    ['Asia/Novosibirsk'],
    ['Asia/Omsk'],
    ['Asia/Oral'],
    ['Asia/Phnom_Penh'],
    ['Asia/Pontianak'],
    ['Asia/Pyongyang'],
    ['Asia/Qatar'],
    ['Asia/Qyzylorda'],
    ['Asia/Rangoon'],
    ['Asia/Riyadh'],
    ['Asia/Sakhalin'],
    ['Asia/Samarkand'],
    ['Asia/Seoul'],
    ['Asia/Shanghai'],
    ['Asia/Singapore'],
    ['Asia/Taipei'],
    ['Asia/Tashkent'],
    ['Asia/Tbilisi'],
    ['Asia/Tehran'],
    ['Asia/Thimphu'],
    ['Asia/Tokyo'],
    ['Asia/Ulaanbaatar'],
    ['Asia/Urumqi'],
    ['Asia/Vientiane'],
    ['Asia/Vladivostok'],
    ['Asia/Yakutsk'],
    ['Asia/Yekaterinburg'],
    ['Asia/Yerevan'],
    ['Atlantic/Azores'],
    ['Atlantic/Bermuda'],
    ['Atlantic/Canary'],
    ['Atlantic/Cape_Verde'],
    ['Atlantic/Faroe'],
    ['Atlantic/Madeira'],
    ['Atlantic/Reykjavik'],
    ['Atlantic/South_Georgia'],
    ['Atlantic/St_Helena'],
    ['Atlantic/Stanley'],
    ['Australia/Adelaide'],
    ['Australia/Brisbane'],
    ['Australia/Broken_Hill'],
    ['Australia/Currie'],
    ['Australia/Darwin'],
    ['Australia/Eucla'],
    ['Australia/Hobart'],
    ['Australia/Lindeman'],
    ['Australia/Lord_Howe'],
    ['Australia/Melbourne'],
    ['Australia/Perth'],
    ['Australia/Sydney'],
    ['Europe/Amsterdam'],
    ['Europe/Andorra'],
    ['Europe/Athens'],
    ['Europe/Belgrade'],
    ['Europe/Berlin'],
    ['Europe/Bratislava'],
    ['Europe/Brussels'],
    ['Europe/Bucharest'],
    ['Europe/Budapest'],
    ['Europe/Chisinau'],
    ['Europe/Copenhagen'],
    ['Europe/Dublin'],
    ['Europe/Gibraltar'],
    ['Europe/Guernsey'],
    ['Europe/Helsinki'],
    ['Europe/Isle_of_Man'],
    ['Europe/Istanbul'],
    ['Europe/Jersey'],
    ['Europe/Kaliningrad'],
    ['Europe/Kiev'],
    ['Europe/Lisbon'],
    ['Europe/Ljubljana'],
    ['Europe/London'],
    ['Europe/Luxembourg'],
    ['Europe/Madrid'],
    ['Europe/Malta'],
    ['Europe/Mariehamn'],
    ['Europe/Minsk'],
    ['Europe/Monaco'],
    ['Europe/Moscow'],
    ['Europe/Oslo'],
    ['Europe/Paris'],
    ['Europe/Podgorica'],
    ['Europe/Prague'],
    ['Europe/Riga'],
    ['Europe/Rome'],
    ['Europe/Samara'],
    ['Europe/San_Marino'],
    ['Europe/Sarajevo'],
    ['Europe/Simferopol'],
    ['Europe/Skopje'],
    ['Europe/Sofia'],
    ['Europe/Stockholm'],
    ['Europe/Tallinn'],
    ['Europe/Tirane'],
    ['Europe/Uzhgorod'],
    ['Europe/Vaduz'],
    ['Europe/Vatican'],
    ['Europe/Vienna'],
    ['Europe/Vilnius'],
    ['Europe/Volgograd'],
    ['Europe/Warsaw'],
    ['Europe/Zagreb'],
    ['Europe/Zaporozhye'],
    ['Europe/Zurich'],
    ['Indian/Antananarivo'],
    ['Indian/Chagos'],
    ['Indian/Christmas'],
    ['Indian/Cocos'],
    ['Indian/Comoro'],
    ['Indian/Kerguelen'],
    ['Indian/Mahe'],
    ['Indian/Maldives'],
    ['Indian/Mauritius'],
    ['Indian/Mayotte'],
    ['Indian/Reunion'],
    ['Pacific/Apia'],
    ['Pacific/Auckland'],
    ['Pacific/Chatham'],
    ['Pacific/Chuuk'],
    ['Pacific/Easter'],
    ['Pacific/Efate'],
    ['Pacific/Enderbury'],
    ['Pacific/Fakaofo'],
    ['Pacific/Fiji'],
    ['Pacific/Funafuti'],
    ['Pacific/Galapagos'],
    ['Pacific/Gambier'],
    ['Pacific/Guadalcanal'],
    ['Pacific/Guam'],
    ['Pacific/Honolulu'],
    ['Pacific/Johnston'],
    ['Pacific/Kiritimati'],
    ['Pacific/Kosrae'],
    ['Pacific/Kwajalein'],
    ['Pacific/Majuro'],
    ['Pacific/Marquesas'],
    ['Pacific/Midway'],
    ['Pacific/Nauru'],
    ['Pacific/Niue'],
    ['Pacific/Norfolk'],
    ['Pacific/Noumea'],
    ['Pacific/Pago_Pago'],
    ['Pacific/Palau'],
    ['Pacific/Pitcairn'],
    ['Pacific/Pohnpei'],
    ['Pacific/Port_Moresby'],
    ['Pacific/Rarotonga'],
    ['Pacific/Saipan'],
    ['Pacific/Tahiti'],
    ['Pacific/Tarawa'],
    ['Pacific/Tongatapu'],
    ['Pacific/Wake'],
    ['Pacific/Wallis']
];

PVE.NodeTimeEdit = Ext.extend(PVE.window.ModalDialog, {

    initComponent : function() {
	var self = this;

	var nodename = self.nodename;

	if (!nodename) 
	    throw "no node name specified";

	var tzstore = new Ext.data.ArrayStore({
	    autoDestroy: true,
	    id: 0,
	    fields: [{name: 'zone', type: 'text' }],
	    data: timezones
	});

	var formpanel = new PVE.form.StdForm({
	    url: "/api2/extjs/nodes/" + nodename + "/time",
	    method: 'PUT',
	    trackResetOnLoad: true,
	    labelWidth: 120,
	    frame: true,
            defaults: {
		width: '100%'
	    },

	    items: [
		{
		    xtype: 'combo',
                    fieldLabel: 'Time zone',
                    name: 'timezone',
		    queryMode: 'local',
		    store: tzstore,
		    valueField: 'zone',
 		    displayField: 'zone',
		    forceSelection: true,
		    triggerAction: 'all',
                    allowBlank: false
		}
	    ]
	});

	formpanel.getForm().load({
	    url: "/api2/extjs/nodes/" + nodename + "/time",
	    method: 'GET',
	    failure: function(form, action) {
		Ext.Msg.alert("Load failed", action.result.message, function() {
		    self.close();
		});
	    }
	});

	var submit = new Ext.Button({
	    text: 'OK',
	    disabled: true,
	    handler: function(){
		formpanel.submitHandler({
		    success: function() { 
			self.close();
		    }
		});
	    }
	});

	formpanel.on("actioncomplete", function(form, action){
	    if(action.type == 'load'){
		submit.enable();
	    }
	});

	Ext.apply(self, {
	    title: "Set time zone",
	    items: formpanel,
	    height: 120,
            width: 400,
	    buttons: [
		submit,
		{
		    text: 'Reset',
		    handler: function(){
			formpanel.getForm().reset();
		    }
		},
		{
		    text: 'Cancel',
		    handler: function(){
			self.close();
		    }
		}
	    ]
	});

	PVE.NodeTimeEdit.superclass.initComponent.call(self);
    }
});

PVE.NodeTimeView = Ext.extend(PVE.grid.ObjectView, {

    initComponent : function() {
	var self = this;

	var nodename = self.nodename;

	if (!nodename) 
	    throw "no node name specified";

	var myid = Ext.id();
	var servertime = 0;
	var starttime = 0;

	var format_time = function() {
	    var now = new Date();
	    var stime = new Date(now.getTime() - starttime + servertime);
	    return stime.format('Y-m-d H:i:s');
	};

	var task = {
	    run: function(){
		var dom = Ext.getDom(myid);
		if (dom) {
		    if (servertime) {
			Ext.fly(dom).update(format_time());
		    }
		}
	    },
	    interval: 1000 //1 second
	};

	var rendertime = function(value) {
	    var now = new Date();
	    servertime = value * 1000;
	    starttime = now.getTime() - now.getTimezoneOffset()*60000;

	    var html = Ext.DomHelper.markup({
		id: myid,
		tag: 'div',
		html: format_time()
	    });

	    return html;
	};

	var store = new PVE.data.ObjectStore({
	    url: "/api2/json/nodes/" + nodename + "/time",
	    method: 'GET',
	    rows: {
		timezone: { header: 'Time zone' },
		localtime: { header: 'Server time', renderer: rendertime }
	    }
	});

	var update_config = function() {
	    store.load();
	};

	var run_editor = function() {
	    var win = new PVE.NodeTimeEdit({
		nodename: nodename //,
	//	height: 150
	    });
	    win.on("close", function() {
		update_config();
	    });
	    win.show();
	};

	Ext.apply(self, {
	    store: store,
	    layout: 'fit',
	    cwidth1: 150,
	    tbar: [ 
		{
		    text: "Edit",
		    handler: run_editor
		}
	    ],
	    listeners: {
		show: function() {
		    update_config();
		    Ext.TaskMgr.start(task);
		},
		hide: function() {
		    servertime = 0;
		    Ext.TaskMgr.stop(task);
		},
		rowdblclick: function() {
		    run_editor();
		},
		destroy: function() {
		    Ext.TaskMgr.stop(task);
		}
	    }
	});

	PVE.NodeTimeView.superclass.initComponent.call(self);
    }
});
Ext.reg('pveNodeTimeView', PVE.NodeTimeView);

PVE.NodeDNSEdit = Ext.extend(PVE.window.ModalDialog, {

    initComponent : function() {
	var self = this;

	var nodename = self.nodename;

	if (!nodename) 
	    throw "no node name specified";

	var formpanel = new PVE.form.StdForm({
	    url: "/api2/extjs/nodes/" + nodename + "/dns",
	    method: 'PUT',
	    trackResetOnLoad: true,

	    labelWidth: 120,
	    frame: true,
            defaults: {
		width: '100%'
	    },

	    items: [
		{
		    xtype: 'textfield',
                    fieldLabel: 'Search domain',
                    name: 'search',
                    allowBlank: false
		}, 
		{
		    html: "<div>&nbsp;</div>"
		},
		{
 		    xtype: 'textfield',
                    fieldLabel: 'First DNS server',
		    vtype: 'IPAddress',
                    name: 'dns1'
		},
		{
 		    xtype: 'textfield',
                    fieldLabel: 'Second DNS server',
		    vtype: 'IPAddress',
                    name: 'dns2'
		},
		{
 		    xtype: 'textfield',
                    fieldLabel: 'Third DNS server',
 		    vtype: 'IPAddress',
                    name: 'dns3'
		}
	    ]
	});


	formpanel.getForm().load({
	    url: "/api2/extjs/nodes/" + nodename + "/dns",
	    method: 'GET',
	    failure: function(form, action) {
		Ext.Msg.alert("Load failed", action.result.message, function() {
		    self.close();
		});
	    }
	});

	var submit = new Ext.Button({
	    text: 'OK',
	    disabled: true,
	    handler: function(){
		formpanel.submitHandler({
		    success: function() { 
			self.close();
		    }
		});
	    }
	});

	formpanel.on("actioncomplete", function(form, action){
	    if(action.type == 'load'){
		submit.enable();
	    }
	});

	Ext.apply(self, {
	    title: "Edit DNS Settings",
	    items: formpanel,
            width: 400,
	    height: 250,
	    buttons: [
		submit,
		{
		    text: 'Reset',
		    handler: function(){
			formpanel.getForm().reset();
		    }
		},
		{
		    text: 'Cancel',
		    handler: function(){
			self.close();
		    }
		}
	    ]
	});

	PVE.NodeDNSEdit.superclass.initComponent.call(self);
    }
});

PVE.NodeDNSView = Ext.extend(PVE.grid.ObjectView, {

    initComponent : function() {
	var self = this;

	var nodename = self.nodename;

	if (!nodename) 
	    throw "no node name specified";

	var store = new PVE.data.ObjectStore({
	    url: "/api2/json/nodes/" + nodename + "/dns",
	    method: 'GET',
	    rows: {
		search: { header: 'Search domain' },
		dns1: { header: 'First DNS server' },
		dns2: { header: 'Second DNS server' },
		dns3: { header: 'Third DNS server' },
	    }
	});

	var update_config = function() {
	    store.load();
	};

	var run_editor = function() {
	    var win = new PVE.NodeDNSEdit({
		nodename: nodename,
		height: 250
	    });
	    win.on("close", function() {
		update_config();
	    });
	    win.show();
	};

	Ext.apply(self, {
	    store: store,
	    layout: 'fit',
	    cwidth1: 150,
	    tbar: [ 
		{
		    text: "Edit",
		    handler: run_editor
		}
	    ],
	    listeners: {
		show: function() {
		    update_config();
		},
		rowdblclick: function() {
		    run_editor();
		}
	    }
	});

	PVE.NodeDNSView.superclass.initComponent.call(self);
    }
});
Ext.reg('pveNodeDNSView', PVE.NodeDNSView);

PVE.NodeServiceView = Ext.extend(PVE.grid.StdGrid, {

    initComponent : function() {
	var self = this;

	var nodename = self.nodename;

	if (!nodename) 
	    throw "no node name specified";

	var store = new Ext.data.JsonStore({
	    url: "/api2/json/nodes/" + nodename + "/services",
	    autoDestory: true,
	    root: 'data',
	    restful: true, // use GET, not POST
	    fields: [ 'service', 'name', 'desc', 'state' ],
	    idProperty: 'service',
	    sortInfo: { field: 'name', order: 'DESC' }
	});

	var update_store = function() {
	    store.load();
	};

	var sm = new Ext.grid.RowSelectionModel({singleSelect: true});

	var service_cmd = function(cmd) {
	    var rec = sm.getSelected();
	    Ext.Ajax.request({
		url: "/api2/json/nodes/" + nodename + "/services/" + rec.data.service,
		params: { command: cmd },
		method: 'PUT',
		failure: function(response, opts) {
		    Ext.Msg.alert("Error", "Error " + response.status + ": " 
				  + response.statusText);
		    update_store();
		},
		success: function(response, opts) {
		    update_store();
		}
	    });
	};

	var start_btn = new Ext.Button({
	    text: 'Start',
	    disabled: true,
	    handler: function(){
		service_cmd("start");
	    }
	});
	var stop_btn = new Ext.Button({
	    text: 'Stop',
	    disabled: true,
	    handler: function(){
		service_cmd("stop");
	    }
	});
	var restart_btn = new Ext.Button({
	    text: 'Restart',
	    disabled: true,
	    handler: function(){
		service_cmd("restart");
	    }
	});

	sm.on('rowselect', function(selm, row, record) {
	    var service = record.data.service;
	    var state = record.data.state;
	    if (service == 'apache' ||
		service == 'pvecluster' ||
		service == 'pvedaemon') {
		if (state == 'running') {
		    start_btn.disable();
		    restart_btn.enable();
		} else {
		    start_btn.enable();
		    restart_btn.disable();
		}
		stop_btn.disable();
	    } else {
		if (state == 'running') {
		    start_btn.disable();
		    restart_btn.enable();
		    stop_btn.enable();
		} else {
		    start_btn.enable();
		    restart_btn.disable();
		    stop_btn.disable();
		}
	    }
	});

	sm.on('rowdeselect', function(selm, row, record) {
	    start_btn.disable();
	    stop_btn.disable();
	    restart_btn.disable();
	});

	var prev_selection;
	store.on('beforeload', function() {
	    prev_selection = sm.getSelected();
	});

	store.on("load", function() {
	    start_btn.disable();
	    stop_btn.disable();
	    restart_btn.disable();
	    if (prev_selection) {
		var recid = store.indexOfId(prev_selection.data.service);
		if (recid >= 0)
		    sm.selectRow(recid);
	    }
	}); 

	Ext.apply(self, {
	    store: store,
	    autoExpandColumn: 'desc',
	    stateful: false,
	    columns: [
		{
		    header: 'Name',
		    width: 100,
		    sortable: true,
		    dataIndex: 'name'
		},
		{
		    header: 'State',
		    width: 100,
		    sortable: true,
		    dataIndex: 'state'
		},
		{
		    header: 'Description',
		    dataIndex: 'desc',
		    id: 'desc'
		}
	    ],
	    sm: sm,
	    listeners: {
		show: function() {
		    update_store();
		}
	    },
	    tbar: [ 
		start_btn, "-", stop_btn, "-", restart_btn
	    ]
	});

	PVE.NodeServiceView.superclass.initComponent.call(self);
    }
});
Ext.reg('pveNodeServiceView', PVE.NodeServiceView);

PVE.NodeStatusView = Ext.extend(PVE.grid.ObjectView, {

    startUpdate: function(delay) {
	var self = this;
	if (self.load_task)
	    self.load_task.delay(delay);
    },

    stopUpdate: function() {
	var self = this;
	if (self.load_task) 
	    self.load_task.cancel();
    },

    initComponent : function() {
	var self = this;

	var nodename = self.nodename;

	if (!nodename) 
	    throw "no node name specified";

	var render_cpuinfo = function(value) {
	    return value.cpus + " x " + value.model;
	};

	var render_loadavg = function(value) {
	    return value[0] + ", " + value[1] + ", " + value[2]; 
	};

	var render_cpu = function(value) {
	    return PVE.Utils.format_large_bar(value*100);
	};

	var render_meminfo_old = function(value) {
	    var per = (value.used / value.total)*100;
	    var text = PVE.Utils.format_size(value.used) + "/" + 
		PVE.Utils.format_size(value.total);
	    return PVE.Utils.format_large_bar(per, text);
	};

	var render_meminfo = function(value) {
	    var per = (value.used / value.total)*100;
	    var text = "<div>Total: " + PVE.Utils.format_size(value.total) + "</div>" + 
		"<div>Used: " + PVE.Utils.format_size(value.used) + "</div>";
	    return text + PVE.Utils.format_large_bar(per);
	};

	var store = new PVE.data.ObjectStore({
	    url: "/api2/json/nodes/" + nodename + "/status",
	    method: 'GET',
	    rows: {
		uptime: { header: 'Uptime', renderer: PVE.Utils.format_duration_long },
		loadavg: { header: 'Load average', renderer: render_loadavg },
		cpuinfo: { header: 'CPUs', renderer: render_cpuinfo },
		cpu: { header: 'CPU usage', renderer: render_cpu },
		wait: { header: 'IO delay', renderer: render_cpu },
		memory: { header: 'RAM usage', renderer: render_meminfo },
		swap: { header: 'SWAP usage', renderer: render_meminfo },
		rootfs: { header: 'HD space (root)', renderer: render_meminfo },
		pveversion: { header: 'PVE Manager version' },
		kversion: { header: 'Kernel version' }
	    }
	});

	var update_store = function() {
	    store.load();
	};

	self.load_task = new Ext.util.DelayedTask(function(delay) {
	    update_store();
	    self.load_task.delay(delay === undefined ? 1000 : delay);
	});

	Ext.apply(self, {
	    store: store,
	    layout: 'fit',
	    cwidth1: 150,
	    listeners: {
		destroy: function() {
		    self.load_task.cancel();
		}
	    }
	});

	PVE.NodeStatusView.superclass.initComponent.call(self);
    }
});
Ext.reg('pveNodeStatusView', PVE.NodeStatusView);

// fixme: create generic class
PVE.RRDView = Ext.extend(Ext.Panel, {

    initComponent : function() {
	var self = this;

	var timeframe = 'hour';

	var majorunit;

	var timefmt;
	if (timeframe == 'hour') {
	    timefmt = "H:i";
	} else if (timeframe == 'day') {
	    timefmt = "D H:i";
	} else if (timeframe == 'week') {
	    timefmt = "D H:i";
	} else {
	    timefmt = "D j H:i";
	}

	var store = new PVE.data.UpdateStore({
	    interval: 3000,
	    itype: 'rrd',
	    idProperty: 'time',
	    autoDestroy: true,
	    url: '/api2/json/nodes/maui/rrddata?timeframe=' + timeframe,
	    fields: [ 
		{ name: 'time', type : 'date', dateFormat: 'timestamp' }, 
		'cpu', 'iowait']
	});

	self.store = store;

	//store.startUpdate();

	Ext.apply(self, {
	    layout: 'fit',
            items: {
		xtype: 'linechart',
		store: store,
		xField: 'time',
		yAxis: new Ext.chart.NumericAxis({
		    labelRenderer: function(val) { 
			return (val*100).toFixed(2) + "%";
		    }
		}),
		xAxis: new Ext.chart.TimeAxis({
		    labelRenderer: function(val) { 
			return Ext.util.Format.date(val, timefmt); 
		    }
		}),
		chartStyle: {
		    xAxis: {
			majorGridLines: {size: 1, color: 0xeeeeee}
		    },
                    yAxis: {
			majorGridLines: {size: 1, color: 0xdfe8f6}
                    }
		},
		series: [
		    {
			type: 'line',
			displayName: 'CPU',
			yField: 'cpu',
		    },
		    {
			type: 'line',
			displayName: 'IO delay',
			yField: 'iowait',
			style: {
			    color:0xff0000
			}
		    }
		]
	    }
	});

	PVE.RRDView.superclass.initComponent.call(self);
    }
});
Ext.reg('pveRRDView', PVE.RRDView);

PVE.RRDGraph = Ext.extend(Ext.Panel, {

    initComponent : function() {
	var self = this;

	if (!self.timeframe) 
	    self.timeframe = 'hour';
	if (!self.rrdcffn)
	    self.rrdcffn = 'AVERAGE';

	var datasource = self.datasource;

	var dcindex = 0;
	var create_url = function() {
	    var url = self.rrdurl + "?ds=" + datasource + 
		"&timeframe=" + self.timeframe + "&cf=" + self.rrdcffn +
		"&_dc=" + dcindex;
	    dcindex++;
	    return url;
	}

	var stateid = 'pverrdtypeselection';

	Ext.apply(self, {
	    layout: 'fit',
	    html: {
		tag: 'img',
		width: 800,
		height: 200,
		src:  create_url()
	    },
	    stateful: true,
	    stateId: stateid,    
	    applyState : function(state) {
		if (state && state.id) {
		    self.timeframe = state.timeframe;
		    self.rrdcffn = state.cf;
		    self.reload_task.delay(10);
		}
	    }

	});
	
	PVE.RRDGraph.superclass.initComponent.call(self);

	self.reload_task = new Ext.util.DelayedTask(function() {
	    if (self.rendered) {
		try {
		    var html = {
			tag: 'img',
			width: 800,
			height: 200,
			src:  create_url()
		    };
		    self.update(html);
		} catch (e) {
		    console.log(e);
		}
		self.reload_task.delay(30000);
	    } else {
		self.reload_task.delay(1000);
	    }
	});

	self.reload_task.delay(30000);

	self.on('destroy', function() {
	    self.reload_task.cancel();
	});

	var sp = Ext.state.Manager.getProvider();

	var state_change_fn = function(prov, key, value) {
	    if (key == stateid) {
		self.timeframe = value.timeframe;
		self.rrdcffn = value.cf;
		self.reload_task.delay(10);
	    }
	};

	sp.on('statechange', state_change_fn);

	self.on('destroy', function() {
	    sp.un('statechange', state_change_fn);
	});
     }
});
Ext.reg('pveRRDGraph', PVE.RRDGraph);

PVE.NodeSummaryView = Ext.extend(Ext.Panel, {

    initComponent : function() {
	var self = this;
	
	var nodename = self.nodename;

	if (!nodename) 
	    throw "no node name specified";

	var statusview = new PVE.NodeStatusView({
	    width: 802,
	    height: 350,
	    nodename: nodename,
	    title: "Status"
	});

	var rrdurl = "/api2/png/nodes/" + nodename + "/rrd";

	var rdtstore = new Ext.data.ArrayStore({
            fields: [ 'id', 'timeframe', 'cf', 'text' ],
            data : [
		[ 'hour', 'hour', 'AVERAGE', "Hour (average)" ],
		[ 'hourmax', 'hour', 'MAX', "Hour (max)" ],
		[ 'day', 'day', 'AVERAGE', "Day (average)" ],
		[ 'daymax', 'day', 'MAX', "Day (max)" ],
		[ 'week', 'week', 'AVERAGE', "Week (average)" ],
		[ 'weekmax', 'week', 'MAX', "Week (max)" ],
		[ 'month', 'month', 'AVERAGE', "Month (average)" ],
		[ 'monthmax', 'month', 'MAX', "Month (max)" ],
		[ 'year', 'year', 'AVERAGE', "Year (average)" ],
		[ 'yearmax', 'year', 'MAX', "Year (max)" ],
	    ]
	});

	var rdtcombo = new Ext.form.ComboBox({
            store: rdtstore,
            displayField: 'text',
	    valueField: 'id',
	    allowBlank: false,
 	    editable: false,
            autoSelect: true,
            mode: 'local',
	    value: 'hour',
            triggerAction: 'all',
	    getState: function() {
		var ind = rdtstore.findExact('id', this.getValue());
		var rec = rdtstore.getAt(ind);
		if (!rec) return;
		return { 
		    id: rec.data.id,
		    timeframe: rec.data.timeframe,
		    cf: rec.data.cf
		};
	    },
	    applyState : function(state) {
		if (state && state.id) {
		    this.setValue(state.id);
		}
	    },
	    stateEvents: [ 'select' ],
	    stateful: true,
	    stateId: 'pverrdtypeselection'        
	});
    
	Ext.apply(self, {
	    layout: 'table',
	    autoScroll: true,
	    bodyStyle: 'padding:10px',
	    layoutConfig: {
		columns: 1
	    },
	    defaults: {
		style: 'padding-bottom:10px'
	    },		
	    tbar: [ 
		{ text: 'Reboot' }, '-',
		{ text: 'Shutdown' }, '-',
		{ 
		    text: 'Console',
		    handler: function() { 
			PVE.newShellWindow(nodename);
		    }
		},
		'->',
		rdtcombo
	    ],
	    items: [
		statusview,
		{
		    xtype: 'pveRRDGraph',
		    title: "CPU usage %",
		    datasource: 'cpu,iowait',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDGraph',
		    title: "Server load",
		    datasource: 'loadavg',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDGraph',
		    title: "Memory usage",
		    datasource: 'memtotal,memused',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDGraph',
		    title: "Network traffic",
		    datasource: 'netin,netout',
		    rrdurl: rrdurl
		}
	    ],
	    listeners: {
		show: function() {
		    statusview.startUpdate(10);
		},
		hide: function() {
		    statusview.stopUpdate();
		}
	    }
	});

	PVE.NodeSummaryView.superclass.initComponent.call(self);
    }
});
Ext.reg('pveNodeSummaryView', PVE.NodeSummaryView);

PVE.NodeTasks = Ext.extend(Ext.grid.GridPanel, {

    initComponent : function() {
	var self = this;

	var nodename = self.nodename;

	if (!nodename) 
	    throw "no node name specified";

	var fields = [ 
	    { name: 'starttime', type : 'date', dateFormat: 'timestamp' }, 
	    { name: 'endtime', type : 'date', dateFormat: 'timestamp' }, 
	    { name: 'pid', type: 'int' },
	    'node', 'upid', 'user', 'status', 'type', 'id'];

	var taskstore = new Ext.data.JsonStore({
	    autoDestroy: true,
	    url: '/api2/json/nodes/' + nodename + '/tasks',
	    idProperty: 'upid',
	    root: 'data',
	    fields: fields,
	    restful: true
	});

	var page_size = 50;

	var userfilter = '';
	var filter_errors = 0;

	var ptbar = new Ext.PagingToolbar({
	    store: taskstore,       // grid and PagingToolbar using same store
	    displayInfo: true,
	    pageSize: page_size
	});

	var reload_task = new Ext.util.DelayedTask(function() {
	    var params = {
		// specify params for the first page load if using paging
		start: 0,          
		limit: page_size,
		errors: filter_errors
	    };
	    if (userfilter)
		params.userfilter = userfilter;

	    taskstore.baseParams = params;
	    ptbar.doRefresh();
	});

	reload_task.delay(1);

	Ext.apply(self, {
	    store: taskstore,
	    border: false,
	    //columnSort: false,
	    autoExpandColumn: 'status',
	    viewConfig: {
		getRowClass: function(record, index) {
		    var status = record.get('status');

		    if (status && status != 'OK') 
			return "x-form-invalid";
		}
	    },
	    tbar: [
		'->', 'User:', ' ',
		{
		    xtype: 'textfield',
		    width: 200,
		    value: userfilter,
		    enableKeyEvents: true,
		    listeners: {
			keyup: function(field, e) {
			    userfilter = field.getValue();
			    reload_task.delay(500);
			}
		    }
		}, ' ', 'Only Errors:', ' ',
		{
		    xtype: 'checkbox',
		    hideLabel: true,
		    checked: filter_errors,
		    listeners: {
			check: function(field, checked) {
			    filter_errors = checked ? 1 : 0;
			    reload_task.delay(1);
			}
		    }
		}
	    ],
	    bbar: ptbar,
	    columns: [
		{ header: "Start Time", dataIndex: 'starttime',
		  width: 100,
		  renderer: function(value) { return value.format("M d H:i:s"); }
		},
		{ header: "End Time", dataIndex: 'endtime',
		  width: 100,
		  renderer: function(value, metaData, record) {
		      return value.format("M d H:i:s"); 
		  }
		},
		{ header: "Node", dataIndex: 'node',
		  width: 100
		},
		{ header: "User", dataIndex: 'user',
		  width: 150
		},
		{ id: 'desc', header: "Description", dataIndex: 'upid', 
		  width: 400,
		  renderer: PVE.Utils.render_upid
		},
		{ id: 'status', header: "Status", dataIndex: 'status', 
		  width: 200,
		  renderer: function(value, metaData, record) { 
		      if (value == 'OK')
			  return 'OK';
		      // metaData.attr = 'style="color:red;"'; 
		      return "ERROR: " + value;
		  }
		}
	    ]});

	PVE.NodeTasks.superclass.initComponent.call(self);
    }
});
Ext.reg('pveNodeTasks', PVE.NodeTasks);

PVE.NodeConfig = Ext.extend(PVE.ConfigPanel, {

    initComponent : function() {
	var self = this;

	var nodename = self.nodename;

	if (!nodename) 
	    throw "no node name specified";

	Ext.apply(self, {
	    title: "Cluster Node '" + nodename + "'", 
	    layout: 'fit',
  	    border: false,
	    items: [
		{
		    title: 'Summary',
		    id: 'summary',
		    //xtype: 'pveNodeStatusView',
		    xtype: 'pveNodeSummaryView',
		    nodename: nodename
		},
		{
		    title: 'Services',
		    id: 'services',
		    xtype: 'pveNodeServiceView',
		    nodename: nodename
		},
		{
		    title: 'Network',
		    id: 'network',
		    html: 'network ' + nodename
		},
		{
		    title: 'DNS',
		    id: 'dns',
		    xtype: 'pveNodeDNSView',
		    nodename: nodename
		},
		{
		    title: 'Time',
		    id: 'time',
		    xtype: 'pveNodeTimeView',
		    nodename: nodename
		},
		{
		    title: 'Tasks',
		    id: 'tasks',
		    xtype: 'pveNodeTasks',
		    nodename: nodename
		}
	    ]
	});

	PVE.NodeConfig.superclass.initComponent.call(self);
    }
});

Ext.reg('pveNodeConfig', PVE.NodeConfig);

