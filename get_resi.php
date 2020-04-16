<?php
$dsn = "mysql:host=mysql;dbname=xxxx";
$user = "xxxx";
$passwd = "xxxx";

$pdo = new PDO($dsn, $user, $passwd);

$id = (!empty($_GET['id'])) ? $_GET['id'] : '';
$resi = (!empty($_GET['resi'])) ? $_GET['resi'] : '';

/*

|  459066 |   14083 | jne_booking_code              | 4AF58F                                                                                                                   
|
|  459067 |   14083 | jne_resi                      | -                                                                                                                        
*/
$stm = $pdo->prepare("SELECT * FROM wp_postmeta WHERE post_id=(SELECT 
post_id FROM wp_postmeta WHERE meta_key='jne_booking_code' AND 
meta_value = ?) AND meta_key = 'jne_resi'");
$stm->bindValue(1, $id);
$stm->execute();

$row = $stm->fetch(PDO::FETCH_ASSOC);


print_r($row);
