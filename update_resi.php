<?php
header('Content-Type: application/json');
$apikey = md5("ini_adalah_api_key"); // ae4f0ca4dadda695a6d0c2fd231ea72a

$id = (!empty($_GET['id'])) ? $_GET['id'] : '';
$resi = (!empty($_GET['resi'])) ? $_GET['resi'] : '';
$key = (!empty($_GET['key'])) ? $_GET['key'] : '';

if ($key !== $apikey) {
		$res = array(
		'success' => 0,
		'msg' => 'Api Key salah'
	);

	die(json_encode($res));
}

$dsn = "mysql:host=mysql;dbname=u281829034_unupy";
$user = "u281829034_apygy";
$passwd = "eqedeZyRuq";

$pdo = new PDO($dsn, $user, $passwd);


/*

|  459066 |   14083 | jne_booking_code              | 4AF58F                                                                                                                   
|
|  459067 |   14083 | jne_resi                      | -                                                                                                                        
*/


$stm = $pdo->prepare("SELECT post_id FROM wp_postmeta WHERE 
meta_key='jne_booking_code' AND meta_value = ?");
$stm->bindValue(1, $id);
$stm->execute();

$get_id = $stm->fetch(PDO::FETCH_ASSOC);

$res = array();
if (!empty($get_id)) {
	$post_id = $get_id['post_id'];
	$stm2 = $pdo->prepare("UPDATE wp_postmeta SET meta_value = ? 
WHERE post_id = ? AND meta_key = 'jne_resi'");
	$stm2->bindValue(1, $resi);
	$stm2->bindValue(2, $post_id);
	$stm2->execute();

	$count = $stm2->rowCount();
	if ($count > 0) {
		$res = array(
			'success' => 1,
			'msg' => 'Berhasil update resi'
		);
	} else {
		$res = array(
			'success' => 0,
			'msg' => 'Gagal update resi'
		);
	}
} else {
	$res = array(
		'success' => 0,
		'msg' => 'Kode booking tidak ditemukan'
	);
}

echo json_encode($res);
